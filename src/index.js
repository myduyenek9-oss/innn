import express from 'express';
import schedule from 'node-schedule';
import { initBazi, getDayFortune } from './bazi/engine.js';
import { testDingtalk } from './services/dingtalk.js';
import { loadConfig, saveConfig } from './services/config.js';
import { sendDailyPush } from './services/fortune-push.js';
import { chatWithAgent, clearAgentHistory, getAgentHistory, getAgentStatus } from './services/agent.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const IS_RAILWAY = Boolean(process.env.RAILWAY_ENVIRONMENT_ID || process.env.RAILWAY_PROJECT_ID);
const ENABLE_WEB_SCHEDULE = process.env.ENABLE_WEB_SCHEDULE === 'true' || !IS_RAILWAY;
const agentHits = new Map();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

initBazi();

app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.get('/api/config', (req, res) => {
  const c = loadConfig();
  c.webhookConfigured = Boolean(c.webhook);
  if (c.webhook) c.webhook = c.webhook.replace(/\?access_token=[\w]+/, '?access_token=***');
  try {
    const day = getDayFortune(new Date());
    if (day && day.bazi) c.bazi = day.bazi;
  } catch(e) { console.error('bazi error:', e.message); }
  res.json(c);
});

app.get('/api/test-dingtalk', async (req, res) => {
  try { await testDingtalk(); res.json({ ok: true, msg: '钉钉连接成功' }); }
  catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'views', 'index.html')));

app.post('/api/config', (req, res) => {
  const { webhook, pushTime, userName, birthDate, birthTime, gender, location } = req.body;
  const current = loadConfig();
  const nextWebhook = webhook && !webhook.includes('***') ? webhook : current.webhook;
  if (!nextWebhook) return res.status(400).json({ ok: false, msg: 'webhook required' });
  saveConfig({ webhook: nextWebhook, pushTime, userName, birthDate, birthTime, gender, location });
  initBazi();
  if (ENABLE_WEB_SCHEDULE) schedulePush();
  res.json({ ok: true });
});

app.post('/api/push', (req, res) => {
  sendDailyPush().then(() => res.json({ ok: true })).catch(e => {
    console.error('Push error:', e.message);
    res.status(500).json({ ok: false, msg: e.message });
  });
});

function checkAgentRateLimit(req) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const limit = Number(process.env.AGENT_RATE_LIMIT || 20);
  const bucket = (agentHits.get(ip) || []).filter(ts => now - ts < windowMs);
  if (bucket.length >= limit) return false;
  bucket.push(now);
  agentHits.set(ip, bucket);
  return true;
}

app.get('/api/agent/status', (req, res) => {
  res.json({ ok: true, ...getAgentStatus() });
});

app.get('/api/agent/history', async (req, res) => {
  try {
    const data = await getAgentHistory();
    res.json({ ok: true, ...data });
  } catch(e) {
    console.error('Agent history error:', e.message);
    res.status(500).json({ ok: false, msg: e.message });
  }
});

app.post('/api/agent/chat', async (req, res) => {
  if (!checkAgentRateLimit(req)) {
    return res.status(429).json({ ok: false, msg: '提问太频繁，请稍后再试' });
  }
  try {
    const result = await chatWithAgent(req.body?.question);
    res.json({ ok: true, ...result });
  } catch(e) {
    console.error('Agent chat error:', e.message);
    res.status(500).json({ ok: false, msg: e.message, status: getAgentStatus() });
  }
});

app.delete('/api/agent/history', async (req, res) => {
  try {
    await clearAgentHistory();
    res.json({ ok: true });
  } catch(e) {
    console.error('Agent clear error:', e.message);
    res.status(500).json({ ok: false, msg: e.message });
  }
});

let _job = null;

function schedulePush() {
  if (_job) { _job.cancel(); _job = null; }
  const cfg = loadConfig();
  const [h, m] = (cfg.pushTime || '06:30').split(':').map(Number);
  const rule = new schedule.RecurrenceRule();
  rule.hour = h;
  rule.minute = m;
  rule.tz = 'Asia/Shanghai';
  _job = schedule.scheduleJob(rule, async () => {
    console.log('[Scheduled Push] ' + new Date().toISOString());
    try {
      await sendDailyPush();
      console.log('Push OK');
    } catch(e) {
      console.error('Push failed:', e.message);
    }
  });
  console.log('Scheduled at: ' + cfg.pushTime + ' CST (Asia/Shanghai) | birthDate: ' + loadConfig().birthDate);
}

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('运势推送服务已启动 http://0.0.0.0:' + PORT);
  if (ENABLE_WEB_SCHEDULE) {
    schedulePush();
  } else {
    console.log('Railway 环境下已关闭网页内置定时，请使用 Cron Service 执行 node src/cron.js');
  }
});
server.setTimeout(60000);
