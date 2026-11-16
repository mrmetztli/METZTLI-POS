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
    if (userError || !user) return json({ error: "Invalid session" }, 401);

    const { email } = await req.json();
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return json({ error: "Invalid email" }, 400);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: platformAdmin, error: roleError } = await admin
      .from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (roleError || !platformAdmin) return json({ error: "Platform administrator permission required" }, 403);

    const { data, error } = await admin.auth.admin.inviteUserByEmail(normalizedEmail, {
      redirectTo: appUrl.replace(/\/$/, "") + "/",
      data: { metztli_customer_invited: true, invited_by_platform_admin: user.id }
    });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, invited_user_id: data.user?.id ?? null });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
  }
});
