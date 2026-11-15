# Supabase Edge Functions

Deploy from the repository root with Supabase CLI after linking the intended project:

```sh
supabase functions deploy business-invite-member
supabase functions deploy platform-invite-customer
```

Set secrets in the Supabase project (never in the client app):

```sh
supabase secrets set SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
supabase secrets set SUPABASE_ANON_KEY="YOUR_PUBLISHABLE_OR_ANON_KEY"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_SECRET"
supabase secrets set APP_SITE_URL="https://YOUR_APP_ORIGIN"
```

The service role key is used only inside the Edge Function runtime. Never put it in GitHub Actions artifacts, APK, EXE, JS, or client configuration.

Before production:
- Configure Auth redirect allow-list to include APP_SITE_URL and the invitation callback.
- Configure SMTP/custom email templates and test delivery.
- Add rate limiting and abuse monitoring.
- Test with a platform admin, owner, admin, cashier, viewer, and unrelated user.
- The employee acceptance screen must read the `invitation` query parameter and call authenticated RPC `accept_business_invitation(p_invitation_id)` after email confirmation/login. Do not trust the query parameter by itself; the SQL function verifies the authenticated email and invitation state.
