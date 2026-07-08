import bcrypt from 'bcryptjs';
import { randomInt, randomUUID } from 'crypto';
import { query } from './db.js';
import { createToken, decryptSecret, encryptSecret, hashValue, maskWebhook } from './crypto-utils.js';
import { sendPasswordResetCode, sendVerificationCode, sendVerificationEmail } from './mailer.js';
import { findDefaultLocation, findLocationByCode } from '../data/locations.js';
import { getTrueSolarTimeInfo } from '../bazi/engine.js';

const TOKEN_HOURS = 24;
const CODE_MINUTES = 10;
const CODE_COOLDOWN_SECONDS = 60;

function cleanEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeDate(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    emailVerified: row.email_verified,
    disabled: Boolean(row.disabled),
    createdAt: row.created_at
  };
}

export async function getUserByEmail(email) {
  const result = await query('SELECT * FROM users WHERE email = $1', [cleanEmail(email)]);
  return result.rows[0] || null;
}

export async function getUserById(id) {
  const result = await query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function createVerificationToken(userId) {
  const token = createToken(32);
  await query(
    `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + ($3 || ' hours')::INTERVAL)`,
    [userId, hashValue(token), TOKEN_HOURS]
  );
  return token;
}

async function createVerificationCode(userId) {
  await assertCodeCooldown('email_verification_tokens', userId);
  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  await query('DELETE FROM email_verification_tokens WHERE user_id = $1', [userId]);
  await query(
    `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + ($3 || ' minutes')::INTERVAL)`,
    [userId, hashValue(`${userId}:${code}`), CODE_MINUTES]
  );
  return code;
}

async function createPasswordResetCode(userId) {
  await assertCodeCooldown('password_reset_tokens', userId);
  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  await query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);
  await query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + ($3 || ' minutes')::INTERVAL)`,
    [userId, hashValue(`${userId}:${code}`), CODE_MINUTES]
  );
  return code;
}

async function assertCodeCooldown(tableName, userId) {
  const result = await query(
    `SELECT EXTRACT(EPOCH FROM (NOW() - created_at))::int AS seconds
     FROM ${tableName}
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );
  const seconds = result.rows[0]?.seconds;
  if (Number.isFinite(seconds) && seconds < CODE_COOLDOWN_SECONDS) {
    throw new Error(`验证码发送太频繁，请 ${CODE_COOLDOWN_SECONDS - seconds} 秒后再试`);
  }
}

export async function registerUser({ email, password, displayName }) {
  const normalizedEmail = cleanEmail(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
    throw new Error('请输入有效邮箱');
  }
  if (String(password || '').length < 8) {
    throw new Error('密码至少 8 位');
  }
  const existing = await getUserByEmail(normalizedEmail);
  if (existing) {
    if (existing.email_verified) throw new Error('该邮箱已注册');
    const passwordHash = await bcrypt.hash(password, 12);
    await query(
      'UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1',
      [existing.id, passwordHash]
    );
    await query(
      'UPDATE user_profiles SET display_name = $2, updated_at = NOW() WHERE user_id = $1',
      [existing.id, displayName || '']
    );
    const mail = await sendCodeForUser(existing.id, normalizedEmail);
    return { userId: existing.id, devCode: mail.devCode || null, mailSent: mail.sent, existingUnverified: true };
  }

  const id = randomUUID();
  const passwordHash = await bcrypt.hash(password, 12);
  await query(
    'INSERT INTO users (id, email, password_hash, role, email_verified) VALUES ($1, $2, $3, $4, $5)',
    [id, normalizedEmail, passwordHash, 'user', false]
  );
  await query(
    'INSERT INTO user_profiles (user_id, display_name) VALUES ($1, $2)',
    [id, displayName || '']
  );
  await query(
    'INSERT INTO user_push_settings (user_id, push_time, enabled) VALUES ($1, $2, $3)',
    [id, '06:30', false]
  );

  let mail;
  try {
    mail = await sendCodeForUser(id, normalizedEmail);
  } catch (error) {
    await query('DELETE FROM users WHERE id = $1', [id]);
    throw error;
  }
  return { userId: id, devCode: mail.devCode || null, mailSent: mail.sent };
}

async function sendCodeForUser(userId, email) {
  const code = await createVerificationCode(userId);
  try {
    return await sendVerificationCode(email, code);
  } catch (error) {
    await query('DELETE FROM email_verification_tokens WHERE user_id = $1', [userId]);
    throw error;
  }
}

export async function verifyEmailToken(token) {
  const tokenHash = hashValue(token || '');
  const result = await query(
    `SELECT * FROM email_verification_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [tokenHash]
  );
  const tokenRow = result.rows[0];
  if (!tokenRow) throw new Error('验证链接无效或已过期');

  await query('UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE id = $1', [tokenRow.user_id]);
  await query('UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1', [tokenRow.id]);
  return true;
}

export async function verifyEmailCode(email, code) {
  const normalizedEmail = cleanEmail(email);
  const cleanCode = String(code || '').trim();
  if (!/^\d{6}$/.test(cleanCode)) {
    throw new Error('请输入 6 位邮箱验证码');
  }

  const user = await getUserByEmail(normalizedEmail);
  if (!user) throw new Error('账号不存在');
  if (user.email_verified) return true;

  const tokenHash = hashValue(`${user.id}:${cleanCode}`);
  const result = await query(
    `SELECT * FROM email_verification_tokens
     WHERE user_id = $1 AND token_hash = $2 AND used_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [user.id, tokenHash]
  );
  const tokenRow = result.rows[0];
  if (!tokenRow) throw new Error('验证码错误或已过期');

  await query('UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE id = $1', [user.id]);
  await query('UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1', [tokenRow.id]);
  return true;
}

export async function loginUser(email, password) {
  const user = await getUserByEmail(email);
  if (!user) throw new Error('邮箱或密码错误');
  if (user.disabled) throw new Error('账号已被禁用，请联系管理员');
  const ok = await bcrypt.compare(String(password || ''), user.password_hash);
  if (!ok) throw new Error('邮箱或密码错误');
  if (!user.email_verified) throw new Error('邮箱未验证，请先输入邮箱验证码完成验证');
  return user;
}

export async function requestPasswordReset(email) {
  const normalizedEmail = cleanEmail(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
    throw new Error('请输入有效邮箱');
  }
  const user = await getUserByEmail(normalizedEmail);
  if (!user || user.disabled) {
    return { mailSent: false, devCode: null, skipped: true };
  }
  const code = await createPasswordResetCode(user.id);
  let mail;
  try {
    mail = await sendPasswordResetCode(normalizedEmail, code);
  } catch (error) {
    await query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);
    throw error;
  }
  return { mailSent: mail.sent, devCode: mail.devCode || null };
}

export async function resetPasswordWithCode(email, code, newPassword) {
  const normalizedEmail = cleanEmail(email);
  const cleanCode = String(code || '').trim();
  if (!/^\d{6}$/.test(cleanCode)) throw new Error('请输入 6 位验证码');
  if (String(newPassword || '').length < 8) throw new Error('新密码至少 8 位');

  const user = await getUserByEmail(normalizedEmail);
  if (!user || user.disabled) throw new Error('验证码错误或已过期');

  const tokenHash = hashValue(`${user.id}:${cleanCode}`);
  const result = await query(
    `SELECT * FROM password_reset_tokens
     WHERE user_id = $1 AND token_hash = $2 AND used_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [user.id, tokenHash]
  );
  const tokenRow = result.rows[0];
  if (!tokenRow) throw new Error('验证码错误或已过期');

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await query('UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1', [user.id, passwordHash]);
  await query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [tokenRow.id]);
  return true;
}

export async function getProfile(userId) {
  const result = await query(
    `SELECT display_name AS "displayName", calendar_type AS "calendarType",
            birth_date::text AS "birthDate", birth_time AS "birthTime", gender, location,
            province, city, county, adcode, longitude, latitude, true_solar_time AS "trueSolarTime",
            bazi_rule AS "baziRule"
     FROM user_profiles WHERE user_id = $1`,
    [userId]
  );
  const row = result.rows[0] || {};
  return {
    displayName: row.displayName || '',
    calendarType: row.calendarType || 'lunar',
    birthDate: normalizeDate(row.birthDate),
    birthTime: row.birthTime || '',
    gender: row.gender || 'male',
    location: row.location || '',
    province: row.province || '',
    city: row.city || '',
    county: row.county || '',
    adcode: row.adcode || '',
    longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
    latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
    trueSolarTime: row.trueSolarTime || '',
    baziRule: row.baziRule || 'beijing_zi_day'
  };
}

export async function saveProfile(userId, profile) {
  const calendarType = profile.calendarType === 'solar' ? 'solar' : 'lunar';
  const baziRule = profile.baziRule === 'true_solar' ? 'true_solar' : 'beijing_zi_day';
  const locationMatch = findLocationByCode(profile.adcode) || findDefaultLocation(profile.location);
  const province = locationMatch?.province?.name || profile.province || '';
  const city = locationMatch?.city?.name || profile.city || '';
  const county = locationMatch?.county?.name || profile.county || '';
  const adcode = locationMatch?.county?.code || profile.adcode || '';
  const longitude = locationMatch?.county?.longitude ?? null;
  const latitude = locationMatch?.county?.latitude ?? null;
  const location = province && city && county ? `${province}${city}${county}` : (profile.location || '');
  const profileForSolar = {
    ...profile,
    calendarType,
    longitude,
    latitude,
    baziRule
  };
  const trueSolarTime = profile.birthDate && profile.birthTime
    ? getTrueSolarTimeInfo(profileForSolar).trueSolarTime
    : '';
  await query(
    `INSERT INTO user_profiles (user_id, display_name, calendar_type, birth_date, birth_time, gender, location, province, city, county, adcode, longitude, latitude, true_solar_time, bazi_rule)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT (user_id) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       calendar_type = EXCLUDED.calendar_type,
       birth_date = EXCLUDED.birth_date,
       birth_time = EXCLUDED.birth_time,
       gender = EXCLUDED.gender,
       location = EXCLUDED.location,
       province = EXCLUDED.province,
       city = EXCLUDED.city,
       county = EXCLUDED.county,
       adcode = EXCLUDED.adcode,
       longitude = EXCLUDED.longitude,
       latitude = EXCLUDED.latitude,
       true_solar_time = EXCLUDED.true_solar_time,
       bazi_rule = EXCLUDED.bazi_rule,
       updated_at = NOW()`,
    [
      userId,
      profile.displayName || '',
      calendarType,
      profile.birthDate || null,
      profile.birthTime || '',
      profile.gender || 'male',
      location,
      province,
      city,
      county,
      adcode,
      longitude,
      latitude,
      trueSolarTime,
      baziRule
    ]
  );
  return getProfile(userId);
}

export async function getPushSettings(userId, { includeSecret = false } = {}) {
  const result = await query(
    `SELECT push_time AS "pushTime", enabled, encrypted_webhook AS "encryptedWebhook"
     FROM user_push_settings WHERE user_id = $1`,
    [userId]
  );
  const row = result.rows[0] || {};
  const webhook = row.encryptedWebhook ? decryptSecret(row.encryptedWebhook) : '';
  return {
    pushTime: row.pushTime || '06:30',
    enabled: Boolean(row.enabled),
    webhookConfigured: Boolean(webhook),
    webhook: includeSecret ? webhook : maskWebhook(webhook)
  };
}

export async function savePushSettings(userId, settings) {
  const current = await getPushSettings(userId, { includeSecret: true });
  const webhook = settings.webhook && !settings.webhook.includes('***')
    ? String(settings.webhook).trim()
    : current.webhook;
  const encryptedWebhook = webhook ? encryptSecret(webhook) : null;
  const enabled = Boolean(settings.enabled) && Boolean(webhook);

  await query(
    `INSERT INTO user_push_settings (user_id, push_time, enabled, encrypted_webhook)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET
       push_time = EXCLUDED.push_time,
       enabled = EXCLUDED.enabled,
       encrypted_webhook = EXCLUDED.encrypted_webhook,
       updated_at = NOW()`,
    [userId, settings.pushTime || '06:30', enabled, encryptedWebhook]
  );
  return getPushSettings(userId);
}

export async function clearPushWebhook(userId) {
  await query(
    `UPDATE user_push_settings
     SET encrypted_webhook = NULL, enabled = FALSE, updated_at = NOW()
     WHERE user_id = $1`,
    [userId]
  );
  return getPushSettings(userId);
}

export async function listAdminUsers() {
  const result = await query(
    `SELECT u.id, u.email, u.role, u.email_verified AS "emailVerified", u.disabled, u.created_at AS "createdAt",
            p.display_name AS "displayName", p.location, p.birth_date::text AS "birthDate",
            ps.enabled AS "pushEnabled", ps.push_time AS "pushTime"
     FROM users u
     LEFT JOIN user_profiles p ON p.user_id = u.id
     LEFT JOIN user_push_settings ps ON ps.user_id = u.id
     ORDER BY u.created_at DESC
     LIMIT 200`
  );
  return result.rows;
}

export async function updateAdminUser(userId, changes, actorUserId) {
  const target = await getUserById(userId);
  if (!target) throw new Error('用户不存在');
  const role = changes.role === 'admin' ? 'admin' : 'user';
  const emailVerified = Boolean(changes.emailVerified);
  const disabled = Boolean(changes.disabled);
  if (userId === actorUserId && (disabled || role !== 'admin')) {
    throw new Error('不能禁用自己或取消自己的管理员权限');
  }
  const result = await query(
    `UPDATE users
     SET role = $2, email_verified = $3, disabled = $4, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [userId, role, emailVerified, disabled]
  );
  return result.rows[0];
}

export async function deleteAdminUser(userId, actorUserId) {
  if (userId === actorUserId) {
    throw new Error('不能删除当前登录的管理员账号');
  }
  const target = await getUserById(userId);
  if (!target) throw new Error('用户不存在');
  await query('DELETE FROM users WHERE id = $1', [userId]);
  return true;
}

export async function deleteAdminUsers(userIds, actorUserId) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map(id => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) throw new Error('请选择要删除的用户');
  if (ids.length > 50) throw new Error('一次最多删除 50 个用户');
  if (ids.includes(actorUserId)) throw new Error('不能删除当前登录的管理员账号');
  const result = await query(
    'DELETE FROM users WHERE id = ANY($1::uuid[]) RETURNING id',
    [ids]
  );
  return result.rows.length;
}

export async function getPushLogs(userId, limit = 30) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 30, 100));
  const result = await query(
    `SELECT push_date AS "pushDate", push_slot AS "pushSlot", status, error, created_at AS "createdAt"
     FROM push_logs
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, safeLimit]
  );
  return result.rows;
}

export async function seedAdminUser() {
  const email = cleanEmail(process.env.ADMIN_EMAIL);
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return null;

  let user = await getUserByEmail(email);
  if (!user) {
    const id = randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);
    await query(
      'INSERT INTO users (id, email, password_hash, role, email_verified) VALUES ($1, $2, $3, $4, $5)',
      [id, email, passwordHash, 'admin', true]
    );
    user = await getUserById(id);
  } else {
    await query(
      'UPDATE users SET role = $2, email_verified = TRUE, updated_at = NOW() WHERE id = $1',
      [user.id, 'admin']
    );
    user = await getUserById(user.id);
  }

  const profile = await getProfile(user.id);
  if (!profile.birthDate) {
    const defaultLocation = findDefaultLocation(process.env.BIRTH_LOCATION || process.env.LOCATION || '福建泉州');
    await saveProfile(user.id, {
      displayName: '管理员',
      calendarType: 'lunar',
      birthDate: process.env.BIRTH_DATE || '2004-01-23',
      birthTime: process.env.BIRTH_TIME || '06:30',
      gender: process.env.GENDER || 'male',
      location: process.env.BIRTH_LOCATION || process.env.LOCATION || '福建泉州',
      adcode: defaultLocation?.county?.code || '350503'
    });
  } else if (!profile.adcode && profile.location) {
    const defaultLocation = findDefaultLocation(profile.location);
    if (defaultLocation?.county?.code) {
      await saveProfile(user.id, { ...profile, adcode: defaultLocation.county.code });
    }
  }

  const push = await getPushSettings(user.id, { includeSecret: true });
  if (!push.webhook && process.env.DINGTALK_WEBHOOK) {
    await savePushSettings(user.id, {
      webhook: process.env.DINGTALK_WEBHOOK,
      pushTime: process.env.PUSH_TIME || '06:30',
      enabled: true
    });
  }

  await query(
    'UPDATE agent_messages SET user_id = $1 WHERE user_id IS NULL',
    [user.id]
  );

  console.log('管理员账号已准备:', email);
  return user;
}

export async function countAgentQuestionsToday(userId, date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  const result = await query(
    `SELECT COUNT(*)::int AS count FROM agent_messages
     WHERE user_id = $1 AND role = 'user' AND fortune_date = $2`,
    [userId, day]
  );
  return result.rows[0]?.count || 0;
}

export async function listDuePushUsers(now = new Date()) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(now).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const currentTime = `${parts.hour}:${parts.minute}`;

  const result = await query(
    `SELECT u.id, u.email, ps.push_time AS "pushTime"
     FROM users u
     JOIN user_push_settings ps ON ps.user_id = u.id
     WHERE u.email_verified = TRUE
       AND ps.enabled = TRUE
       AND ps.encrypted_webhook IS NOT NULL
       AND ps.push_time <= $1
       AND NOT EXISTS (
         SELECT 1 FROM push_logs pl
         WHERE pl.user_id = u.id AND pl.push_date = $2 AND pl.push_slot = ps.push_time AND pl.status = 'success'
       )`,
    [currentTime, today]
  );
  return { users: result.rows, today };
}

export async function recordPushLog(userId, pushDate, pushSlot, status, error = '') {
  await query(
    `INSERT INTO push_logs (user_id, push_date, push_slot, status, error)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, push_date, push_slot) DO UPDATE SET
       status = EXCLUDED.status,
       error = EXCLUDED.error,
       created_at = NOW()`,
    [userId, pushDate, pushSlot, status, error]
  );
}
