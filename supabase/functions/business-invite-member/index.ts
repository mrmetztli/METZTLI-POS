import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_SITE_URL") ?? "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const appUrl = Deno.env.get("APP_SITE_URL");
  if (!url || !anonKey || !serviceKey || !appUrl) return json({ error: "Server configuration incomplete" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

  try {
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user?.email) return json({ error: "Invalid session" }, 401);

    const { email, role, business_id } = await req.json();
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return json({ error: "Invalid email" }, 400);
    if (!["admin", "cashier", "viewer"].includes(role) || !business_id) return json({ error: "Invalid business or role" }, 400);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: membership, error: membershipError } = await admin
      .from("business_members").select("role")
      .eq("business_id", business_id).eq("user_id", user.id).maybeSingle();
    if (membershipError || !membership || !["owner", "admin"].includes(membership.role)) {
      return json({ error: "You cannot invite members to this business" }, 403);
    }
    if (role === "admin" && membership.role !== "owner") return json({ error: "Only the owner can invite an administrator" }, 403);

    const invitationId = crypto.randomUUID();
    const randomToken = crypto.randomUUID() + crypto.randomUUID();
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(randomToken));
    const tokenHash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
    const { error: insertError } = await admin.from("business_invitations").insert({
      id: invitationId, business_id, email: normalizedEmail, role,
      invited_by: user.id, token_hash: tokenHash,
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString()
    });
    if (insertError) return json({ error: insertError.message }, 400);

    const redirectTo = appUrl.replace(/\/$/, "") + "/?invitation=" + encodeURIComponent(invitationId);
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(normalizedEmail, {
      redirectTo,
      data: { metztli_business_invitation: invitationId }
    });
    if (inviteError) {
      await admin.from("business_invitations").delete().eq("id", invitationId);
      return json({ error: inviteError.message }, 400);
    }
    return json({ ok: true, invitation_id: invitationId, expires_in_days: 7 });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
  }
});
