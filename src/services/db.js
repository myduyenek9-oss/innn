import { Pool } from 'pg';

let pool = null;

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool() {
  if (!isDatabaseConfigured()) {
    throw new Error('DATABASE_URL 未配置');
  }
  if (!pool) {
    const sslMode = process.env.PGSSLMODE || '';
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: sslMode === 'require' ? { rejectUnauthorized: false } : undefined
    });
  }
  return pool;
}

export async function query(text, params = []) {
  return getPool().query(text, params);
}

export async function ensureSchema() {
  if (!isDatabaseConfigured()) return false;

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      disabled BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled BOOLEAN NOT NULL DEFAULT FALSE');

  await query(`
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_created ON password_reset_tokens(user_id, created_at DESC)');

  await query(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      display_name TEXT,
      calendar_type TEXT NOT NULL DEFAULT 'lunar' CHECK (calendar_type IN ('lunar', 'solar')),
      birth_date DATE,
      birth_time TEXT,
      gender TEXT NOT NULL DEFAULT 'male',
      location TEXT,
      province TEXT,
      city TEXT,
      county TEXT,
      adcode TEXT,
      longitude DOUBLE PRECISION,
      latitude DOUBLE PRECISION,
      true_solar_time TEXT,
      bazi_rule TEXT NOT NULL DEFAULT 'beijing_zi_day',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS province TEXT');
  await query('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS city TEXT');
  await query('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS county TEXT');
  await query('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS adcode TEXT');
  await query('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION');
  await query('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION');
  await query('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS true_solar_time TEXT');
  await query("ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS bazi_rule TEXT NOT NULL DEFAULT 'beijing_zi_day'");

  await query(`
    CREATE TABLE IF NOT EXISTS user_push_settings (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      push_time TEXT NOT NULL DEFAULT '06:30',
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      encrypted_webhook TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS agent_messages (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      fortune_date DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query('ALTER TABLE agent_messages ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE');
  await query('DELETE FROM agent_messages WHERE user_id IS NULL');
  await query('ALTER TABLE agent_messages ALTER COLUMN user_id SET NOT NULL');
  await query('CREATE INDEX IF NOT EXISTS idx_agent_messages_user_created ON agent_messages(user_id, created_at DESC)');

  await query(`
    CREATE TABLE IF NOT EXISTS push_logs (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      push_date DATE NOT NULL,
      push_slot TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, push_date, push_slot)
    )
  `);

  return true;
}
