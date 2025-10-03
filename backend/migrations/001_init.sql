-- 001_init.sql: Initial schema migration for OnePassWord
-- Requires: Supabase setup (auth.users table exists automatically)

CREATE TYPE user_role AS ENUM ('user', 'superadmin');

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    supabase_user_id UUID UNIQUE NOT NULL, -- links to auth.users.id
    username VARCHAR(32) NOT NULL UNIQUE,  -- must be lowercase (enforced in frontend)
    role user_role NOT NULL,               -- supersedes any role in auth.users
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE vaults (
    vault_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_name VARCHAR(64) NOT NULL,
    encrypted_vault_key TEXT NOT NULL,      -- base64
    salt TEXT NOT NULL,                     -- base64
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE password_entries (
    item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_id UUID NOT NULL REFERENCES vaults(vault_id) ON DELETE CASCADE,
    encrypted_label TEXT NOT NULL,
    encrypted_website TEXT,
    encrypted_username TEXT,
    encrypted_password TEXT NOT NULL,
    nonce TEXT NOT NULL,
    tag TEXT NOT NULL,
    item_type VARCHAR(16) CHECK (item_type IN ('website', 'note')),
    date_created TIMESTAMPTZ DEFAULT NOW(),
    date_modified TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE audit_logs (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_id UUID REFERENCES vaults(vault_id) ON DELETE SET NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    item_id UUID REFERENCES password_entries(item_id) ON DELETE SET NULL,
    action VARCHAR(32) NOT NULL, -- e.g. 'created', 'viewed', 'copied'
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_supabase_user_id ON users(supabase_user_id);
CREATE INDEX idx_vaults_user_id ON vaults(user_id);
CREATE INDEX idx_password_entries_vault_id ON password_entries(vault_id);
CREATE INDEX idx_audit_logs_vault_id ON audit_logs(vault_id);

-- Supabase users need to be added to our app/users table via backend logic upon registration.
