DROP TYPE IF EXISTS user_role CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS vaults CASCADE;
DROP TABLE IF EXISTS items CASCADE;
DROP TABLE IF EXISTS password_entries CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;

CREATE TYPE user_role AS ENUM ('user', 'superadmin');

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    supabase_user_id UUID UNIQUE NOT NULL, -- links to auth.users.id
    username VARCHAR(32) NOT NULL UNIQUE,  -- must be lowercase (enforced in frontend)
    role user_role NOT NULL,               -- supersedes any role in auth.users
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
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

CREATE TABLE items (
    item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_id UUID NOT NULL REFERENCES vaults(vault_id) ON DELETE CASCADE,
    item_type VARCHAR(16) NOT NULL CHECK (item_type IN ('password','note')),
    encrypted_label TEXT NOT NULL,
    date_created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date_modified TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE password_entries (
    item_id UUID PRIMARY KEY REFERENCES items(item_id) ON DELETE CASCADE,
    encrypted_website TEXT,
    encrypted_username TEXT,
    encrypted_password TEXT NOT NULL,
    nonce TEXT NOT NULL,
    tag TEXT NOT NULL
);

CREATE TABLE audit_logs (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_id UUID REFERENCES vaults(vault_id) ON DELETE SET NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    item_id UUID REFERENCES items(item_id) ON DELETE SET NULL,
    action VARCHAR(32) NOT NULL, -- e.g. 'created', 'viewed', 'copied'
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_supabase_user_id ON users(supabase_user_id);
CREATE INDEX idx_vaults_user_id ON vaults(user_id);
CREATE INDEX idx_items_vault_id ON items(vault_id);
CREATE INDEX idx_password_entries_item_id ON password_entries(item_id);
CREATE INDEX idx_audit_logs_vault_id ON audit_logs(vault_id);