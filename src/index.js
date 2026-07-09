import 'dotenv/config';
import express from 'express';
import schedule from 'node-schedule';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildBazi } from './bazi/engine.js';
import { LOCATION_TREE } from './data/locations.js';
import { chatWithAgent, clearAgentHistory, getAgentHistory, getAgentStatus } from './services/agent.js';
import { clearAuthCookie, currentUserResponse, optionalAuth, requireAdmin, requireAuth, setAuthCookie, signAuthToken } from './services/auth.js';
import { ensureSchema } from './services/db.js';
import { testDingtalk } from './services/dingtalk.js';
import { processDuePushes, sendDailyPushForUser } from './services/fortune-push.js';
import { getRecentMessages } from './services/agent-store.js';
import { getEmailStatus, sendAdminTestEmail } from './services/mailer.js';
import {
  getPushLogs,
  clearPushWebhook,
  deleteAdminUser,
  deleteAdminUsers,
  getProfile,
  getPushSettings,
  loginUser,
  listAdminUsers,
  publicUser,
  registerUser,
  requestPasswordReset,
  resetPasswordWithCode,
  saveProfile,
  savePushSettings,
  seedAdminUser,
  updateAdminUser,
  verifyEmailCode,
  verifyEmailToken
} from './services/users.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const IS_RAILWAY = Boolean(process.env.RAILWAY_ENVIRONMENT_ID || process.env.RAILWAY_PROJECT_ID);
const ENABLE_WEB_SCHEDULE = process.env.ENABLE_WEB_SCHEDULE
  ? process.env.ENABLE_WEB_SCHEDULE === 'true'
  : !IS_RAILWAY;
const agentHits = new Map();

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(optionalAuth);

app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'views', 'index.html')));
app.get('/api/locations', (req, res) => res.json({ ok: true, locations: LOCATION_TREE }));
app.get('/api/system/email-status', (req, res) => res.json({ ok: true, email: getEmailStatus() }));

app.post('/api/auth/register', async (req, res) => {
  try {
    const result = await registerUser(req.body || {});
    res.json({
      ok: true,
      msg: result.mailSent ? '注册成功，请查收邮箱里的 6 位验证码' : '注册成功，本地模式请使用下面的验证码',
      devCode: result.devCode
    });
  } catch(e) {
    res.status(400).json({ ok: false, msg: e.message });
  }
});

app.post('/api/auth/verify-code', async (req, res) => {
  try {
    await verifyEmailCode(req.body?.email, req.body?.code);
    res.json({ ok: true, msg: '邮箱验证成功，现在可以登录' });
  } catch(e) {
    res.status(400).json({ ok: false, msg: e.message });
  }
});

app.get('/api/auth/verify', async (req, res) => {
  try {
    await verifyEmailToken(req.query.token);
    res.type('html').send('<h2>邮箱验证成功</h2><p>现在可以回到页面登录使用。</p><p><a href="/">返回首页</a></p>');
  } catch(e) {
    res.status(400).type('html').send(`<h2>邮箱验证失败</h2><p>${e.message}</p><p><a href="/">返回首页</a></p>`);
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const user = await loginUser(req.body?.email, req.body?.password);
    setAuthCookie(res, signAuthToken(user));
    res.json({ ok: true, user: publicUser(user) });
  } catch(e) {
    res.status(401).json({ ok: false, msg: e.message });
  }
});

app.post('/api/auth/request-password-reset', async (req, res) => {
  try {
    const result = await requestPasswordReset(req.body?.email);
    res.json({
      ok: true,
      msg: result.mailSent ? '验证码已发送，请查收邮箱' : '如果该邮箱存在，本地模式请使用下面的验证码',
      devCode: result.devCode
    });
  } catch(e) {
    res.status(400).json({ ok: false, msg: e.message });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    await resetPasswordWithCode(req.body?.email, req.body?.code, req.body?.newPassword);
    res.json({ ok: true, msg: '密码已重置，请重新登录' });
  } catch(e) {
    res.status(400).json({ ok: false, msg: e.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', async (req, res) => {
  if (!req.user) return res.json({ ok: true, authenticated: false });
  res.json({ ok: true, authenticated: true, user: currentUserResponse(req.user) });
});

app.get('/api/profile', requireAuth, async (req, res) => {
  try {
    const profile = await getProfile(req.user.id);
    let bazi = null;
    if (profile.birthDate && profile.birthTime) bazi = buildBazi(profile);
    res.json({ ok: true, profile, bazi });
  } catch(e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

app.post('/api/profile', requireAuth, async (req, res) => {
  try {
    const profile = await saveProfile(req.user.id, req.body || {});
    const bazi = profile.birthDate && profile.birthTime ? buildBazi(profile) : null;
    res.json({ ok: true, profile, bazi });
  } catch(e) {
    res.status(400).json({ ok: false, msg: e.message });
  }
});

app.get('/api/push-settings', requireAuth, async (req, res) => {
  try {
    const settings = await getPushSettings(req.user.id);
    res.json({ ok: true, settings });
  } catch(e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

app.post('/api/push-settings', requireAuth, async (req, res) => {
  try {
    const settings = await savePushSettings(req.user.id, req.body || {});
    res.json({ ok: true, settings });
  } catch(e) {
    res.status(400).json({ ok: false, msg: e.message });
  }
});

app.delete('/api/push-settings/webhook', requireAuth, async (req, res) => {
  try {
    const settings = await clearPushWebhook(req.user.id);
    res.json({ ok: true, settings });
  } catch(e) {
    res.status(400).json({ ok: false, msg: e.message });
  }
});

app.post('/api/test-dingtalk', requireAuth, async (req, res) => {
  try {
    const push = await getPushSettings(req.user.id, { includeSecret: true });
    await testDingtalk(push.webhook);
    res.json({ ok: true, msg: '钉钉连接成功' });
  } catch(e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

app.post('/api/push', requireAuth, async (req, res) => {
  try {
    await sendDailyPushForUser(req.user.id);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

function checkAgentRateLimit(req) {
  const key = req.user?.id || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const limit = Number(process.env.AGENT_RATE_LIMIT || 30);
  const bucket = (agentHits.get(key) || []).filter(ts => now - ts < windowMs);
  if (bucket.length >= limit) return false;
  bucket.push(now);
  agentHits.set(key, bucket);
  return true;
}

app.get('/api/agent/status', requireAuth, async (req, res) => {
  res.json({ ok: true, ...getAgentStatus() });
});

app.get('/api/agent/history', requireAuth, async (req, res) => {
  try {
    const data = await getAgentHistory(req.user.id);
    res.json({ ok: true, ...data });
  } catch(e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

app.post('/api/agent/chat', requireAuth, async (req, res) => {
  if (!checkAgentRateLimit(req)) {
    return res.status(429).json({ ok: false, msg: '提问太频繁，请稍后再试' });
  }
  try {
    const result = await chatWithAgent(req.user.id, req.body?.question);
    res.json({ ok: true, ...result });
  } catch(e) {
    res.status(500).json({ ok: false, msg: e.message, status: getAgentStatus() });
  }
});

app.delete('/api/agent/history', requireAuth, async (req, res) => {
  try {
    await clearAgentHistory(req.user.id);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const users = await listAdminUsers();
    res.json({ ok: true, users });
  } catch(e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

app.get('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const users = await listAdminUsers();
    const user = users.find(item => item.id === req.params.id);
    if (!user) return res.status(404).json({ ok: false, msg: '用户不存在' });
    const [profile, pushSettings, messages, pushLogs] = await Promise.all([
      getProfile(req.params.id),
      getPushSettings(req.params.id),
      getRecentMessages(req.params.id, 20),
      getPushLogs(req.params.id, 30)
    ]);
    const bazi = profile.birthDate && profile.birthTime ? buildBazi(profile) : null;
    res.json({ ok: true, user, profile, bazi, pushSettings, messages, pushLogs });
  } catch(e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

app.patch('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const user = await updateAdminUser(req.params.id, req.body || {}, req.user.id);
    res.json({ ok: true, user: publicUser(user) });
  } catch(e) {
    res.status(400).json({ ok: false, msg: e.message });
  }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    await deleteAdminUser(req.params.id, req.user.id);
    res.json({ ok: true });
  } catch(e) {
    res.status(400).json({ ok: false, msg: e.message });
  }
});

app.post('/api/admin/users/bulk-delete', requireAdmin, async (req, res) => {
  try {
    const deleted = await deleteAdminUsers(req.body?.ids, req.user.id);
    res.json({ ok: true, deleted });
  } catch(e) {
    res.status(400).json({ ok: false, msg: e.message });
  }
});

app.post('/api/admin/test-email', requireAdmin, async (req, res) => {
  try {
    await sendAdminTestEmail(req.body?.email || req.user.email);
    res.json({ ok: true, msg: '测试邮件已发送' });
  } catch(e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

app.patch('/api/admin/users/:id/profile', requireAdmin, async (req, res) => {
  try {
    const profile = await saveProfile(req.params.id, req.body || {});
    const bazi = profile.birthDate && profile.birthTime ? buildBazi(profile) : null;
    res.json({ ok: true, profile, bazi });
  } catch(e) {
    res.status(400).json({ ok: false, msg: e.message });
  }
});

app.patch('/api/admin/users/:id/push-settings', requireAdmin, async (req, res) => {
  try {
    const settings = await savePushSettings(req.params.id, req.body || {});
    res.json({ ok: true, settings });
  } catch(e) {
    res.status(400).json({ ok: false, msg: e.message });
  }
});

app.delete('/api/admin/users/:id/push-settings/webhook', requireAdmin, async (req, res) => {
  try {
    const settings = await clearPushWebhook(req.params.id);
    res.json({ ok: true, settings });
  } catch(e) {
    res.status(400).json({ ok: false, msg: e.message });
  }
});

app.delete('/api/admin/users/:id/agent-history', requireAdmin, async (req, res) => {
  try {
    await clearAgentHistory(req.params.id);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

app.get('/api/admin/users/:id/push-logs', requireAdmin, async (req, res) => {
  try {
    const pushLogs = await getPushLogs(req.params.id, req.query.limit || 30);
    res.json({ ok: true, pushLogs });
  } catch(e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

let _job = null;
function schedulePushLoop() {
  if (_job) _job.cancel();
  const rule = new schedule.RecurrenceRule();
  rule.second = 0;
  _job = schedule.scheduleJob(rule, async () => {
    try {
      const results = await processDuePushes(new Date());
      if (results.length) console.log('[Scheduled Push]', results);
    } catch(e) {
      console.error('Scheduled push failed:', e.message);
    }
  });
  console.log('本地网页服务已启用每分钟多人推送轮询');
}

async function start() {
  try {
    const ready = await ensureSchema();
    if (ready) {
      await seedAdminUser();
    } else {
      console.warn('未配置 DATABASE_URL，已跳过数据库初始化与管理员种子。');
    }
  } catch (err) {
    console.warn('数据库初始化失败，当前将以降级模式启动：', err.message);
  }
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('运势推送服务已启动 http://0.0.0.0:' + PORT);
    if (ENABLE_WEB_SCHEDULE) {
      schedulePushLoop();
    } else {
      console.log('Railway 环境下已关闭网页内置定时，请使用 Cron Service 执行 npm run cron');
    }
  });
  server.setTimeout(60000);
}

start().catch(err => {
  console.error('服务启动失败:', err.message);
  process.exit(1);
});
