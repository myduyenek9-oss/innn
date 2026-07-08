let pool = null;

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

async function getPool() {
  if (!isDatabaseConfigured()) {
    throw new Error('DATABASE_URL 未配置，无法保存聊天记录');
  }
  if (pool) return pool;

  const { Pool } = await import('pg');
  const sslMode = process.env.PGSSLMODE || '';
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslMode === 'require' ? { rejectUnauthorized: false } : undefined
  });
  return pool;
}

export async function ensureAgentSchema() {
  if (!isDatabaseConfigured()) return false;
  const db = await getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS agent_messages (
      id BIGSERIAL PRIMARY KEY,
      role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      fortune_date DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  return true;
}

export async function getRecentMessages(limit = 30) {
  await ensureAgentSchema();
  const db = await getPool();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 30, 50));
  const result = await db.query(
    `SELECT id, role, content, fortune_date AS "fortuneDate", created_at AS "createdAt"
     FROM (
       SELECT id, role, content, fortune_date, created_at
       FROM agent_messages
       ORDER BY created_at DESC
       LIMIT $1
     ) recent
     ORDER BY created_at ASC`,
    [safeLimit]
  );
  return result.rows;
}

export async function saveMessage(role, content, date = new Date()) {
  await ensureAgentSchema();
  const db = await getPool();
  const day = date.toISOString().slice(0, 10);
  await db.query(
    'INSERT INTO agent_messages (role, content, fortune_date) VALUES ($1, $2, $3)',
    [role, content, day]
  );
}

export async function clearMessages() {
  await ensureAgentSchema();
  const db = await getPool();
  await db.query('DELETE FROM agent_messages');
}
