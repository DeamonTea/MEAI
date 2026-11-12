# MEAI Next Managed

Desktop English-learning application built with Electron and JavaScript.

## Development

```powershell
npm install
npm start
```

To package for Windows x64:

```powershell
npm run pack:win
```

Run the SQL in `supabase/MEAI-Supabase-schema.sql` in the Supabase SQL editor before first use. For an existing project, run `supabase/migrations/20261112_review_content_reports.sql` then `supabase/migrations/20261112_security_hardening.sql` and `supabase/migrations/20261112_unit_analysis_meta.sql` after the base schema. The combined schema file includes all migrations. Configure AI provider keys from Admin settings. Do not commit `.env` files, credentials, or API keys.

The desktop app still uses MEAI's custom username/password login and a Supabase secret/service-role key. Its main process checks Admin actions, while service-role requests bypass Supabase RLS. The migration includes RLS policies for Supabase Auth callers whose `auth.uid()` matches `public.users.id`; strict per-user database enforcement for the desktop app requires moving these operations behind Supabase Auth or a trusted backend.


New accounts created manually or from Excel are required to change their temporary password on first login. AI settings are Admin-only. Admin actions are recorded in admin_audit_logs; apply the security migration before relying on the audit view. API keys and the Supabase connection are encrypted with Windows safeStorage in the current Windows user profile and are not returned to the UI. The pack command excludes environment files and common credential/key file extensions.
