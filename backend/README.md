# Backend Setup: OnePassWord

## Prerequisites
- Node.js, npm
- PostgreSQL (managed by Supabase, recommended)
- Supabase project (get URL, service key & JWT secret)

## 1. Configure environment
Copy .env.example to .env and fill in your project values:
```
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
SUPABASE_JWT_SECRET=...
PORT=4000
```

## 2. Run migration
```
psql <your-supabase-connstring> -f migrations/001_init.sql
```
Or use the Supabase dashboard SQL editor.

## 3. Install & start Express backend
```
npm install
npm run dev
```

## 4. Supabase Auth
- All authentication uses Supabase Auth (users manage signup/in via frontend Supabase calls)
- On registration, the backend syncs supabase_user_id and username/role to its own users table
- API requests must send Supabase access token as `Authorization: Bearer <token>`

See /api/health and /api/protected routes for example.

## DATABASE_URL
Set your pg connection string for Supabase Postgres in `.env` (see `.env.example`)

## User registration (sync Supabase Auth user)

POST /api/users/register (authenticated)
Body:
```
{
  "supabase_user_id": "<uuid>",
  "username": "<desired username>",
  "role": "user" // or "superadmin"
}
```

Curl example (you must get a Supabase JWT first!):
```
curl -X POST http://localhost:4000/api/users/register \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{"supabase_user_id": "...", "username": "sample", "role": "user"}'
```