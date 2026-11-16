# Supabase Edge Functions

Deploy from the repository root with Supabase CLI after linking the intended project:

```sh
supabase functions deploy business-invite-member
supabase functions deploy platform-invite-customer
supabase functions deploy platform-admin-status
```

Configure the project secrets (Supabase normally supplies URL and keys to the Edge Function runtime; verify them in the dashboard):

```sh
supabase secrets set APP_SITE_URL="https://YOUR_APP_ORIGIN"
```

If the default environment variables are not present in the project, configure `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` as server-side secrets. The service role key is used only inside Edge Function runtime. Never put it in GitHub Actions artifacts, APK, EXE, JS, or client configuration.

## Functions

- `business-invite-member`: validates caller membership/role, creates an expiring invitation and sends Auth invite email. If the employee already has an Auth account, it returns an acceptance URL; the employee must log in with the exact invited email before accepting.
- `platform-admin-status`: tells the authenticated client whether the user is in `platform_admins`; the table itself is never exposed to client roles.
- `platform-invite-customer`: only platform admins may invite customer accounts. The invited customer creates their own business after signing in.

Before production:
- Configure Auth redirect allow-list to include APP_SITE_URL and the invitation callback.
- Configure SMTP/custom email templates and test delivery.
- Add rate limiting and abuse monitoring.
- Test with a platform admin, owner, admin, cashier, viewer, and unrelated user.
- The employee acceptance screen reads the `invitation` query parameter and calls authenticated RPC `accept_business_invitation(p_invitation_id)` after login. The SQL function verifies the authenticated email and invitation state; the query parameter alone grants no access.
