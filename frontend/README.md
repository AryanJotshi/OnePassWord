# Frontend (React) - OnePassWord

## Setup
1. Install dependencies:
   cd frontend && npm install

2. Set env for backend URL:
   echo 'VITE_BACKEND_URL=http://localhost:4000' > .env.local

3. In Supabase Dashboard:
   - Set up project, get anon key and url, configure auth.

## Usage note
- Username is mapped to email as username@onepassword.local to use Supabase Auth (which requires email).
- All vault/password encryption/decryption is client-side using Argon2id as primary KDF (via `argon2-browser`). PBKDF2 is used if Argon2 is not available.

## Running
npm run dev

## Pages
- Auth: sign up/in
- Dashboard: list/create vaults (encrypts local key)
- Vault: unlock vault, add/list items, client-side decrypt/copy only
