import { query } from './db.js';

export async function getRecentMessages(userId, limit = 30) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 30, 50));
  const result = await query(
    `SELECT id, role, content, fortune_date AS "fortuneDate", created_at AS "createdAt"
     FROM (
       SELECT id, role, content, fortune_date, created_at
       FROM agent_messages
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2
     ) recent
     ORDER BY created_at ASC`,
    [userId, safeLimit]
  );
  return result.rows;
}

export async function saveMessage(userId, role, content, date = new Date()) {
  if (!userId) throw new Error('缺少当前用户，无法保存聊天记录');
  const day = date.toISOString().slice(0, 10);
  await query(
    'INSERT INTO agent_messages (user_id, role, content, fortune_date) VALUES ($1, $2, $3, $4)',
    [userId, role, content, day]
  );
}

export async function clearMessages(userId) {
  await query('DELETE FROM agent_messages WHERE user_id = $1', [userId]);
}
