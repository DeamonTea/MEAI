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

Run the SQL in `supabase/MEAI-Supabase-schema.sql` in the Supabase SQL editor before first use. Configure the Supabase connection and AI provider keys from the app's settings screen. Do not commit `.env` files, credentials, or API keys.
