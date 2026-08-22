# Supabase

The initial workspace schema lives in `migrations/20260821000000_workspace_schema.sql`.

It models one owner per workspace and any number of members. Projects, tasks and anomalies carry `workspace_id` so tenant filtering and RLS checks do not depend on application joins.

Apply the migration after installing the Supabase CLI and linking the project:

```bash
npx supabase login
npx supabase link --project-ref bnfnbukwyvqzgpifeukm
npx supabase db push
```

The browser client uses only `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Never expose `SUPABASE_SERVICE_ROLE_KEY` through a `VITE_` variable or ship it to the browser. Invitations that need the Admin Auth API should be implemented in an Edge Function.
