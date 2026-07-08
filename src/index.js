import express from 'express';
import schedule from 'node-schedule';
import { initBazi, getDayFortune, getWeekFortune, getMonthFortune, getYearFortune } from './bazi/engine.js';
import { pushToDingtalk, testDingtalk } from './services/dingtalk.js';
import { loadConfig, saveConfig } from './services/config.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

initBazi();

app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.get('/api/config', (req, res) => {
  const c = loadConfig();
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
  if (!webhook) return res.status(400).json({ ok: false, msg: 'webhook required' });
  saveConfig({ webhook, pushTime, userName, birthDate, birthTime, gender, location });
  initBazi();
  schedulePush();
  res.json({ ok: true });
});

app.post('/api/push', (req, res) => {
  sendDailyPush().then(() => res.json({ ok: true })).catch(e => {
    console.error('Push error:', e.message);
    res.status(500).json({ ok: false, msg: e.message });
  });
});

async function sendDailyPush() {
  const now = new Date();
  const day = getDayFortune(now);
  const week = getWeekFortune(now);
  const month = getMonthFortune(now);
  const year = getYearFortune(now);

  const text = '# 【运势】每日运势提醒\n\n' +
    '**' + day.dateStr + '** - ' + day.lunarStr + '\n\n' +
    '---\n\n' +
    '## 今日运势\n' + day.content + '\n\n' +
    '---\n\n' +
    '## 本周运势\n' + week.content + '\n\n' +
    '---\n\n' +
    '## 本月运势\n' + month.content + '\n\n' +
    '---\n\n' +
    '## 本年运势\n' + year.content + '\n\n' +
    '---\n*八字运势推送系统 - ' + now.getFullYear() + '年' + (now.getMonth()+1) + '月' + now.getDate() + '日*';

  const msg = {
    msgtype: 'markdown',
    markdown: {
      title: '【运势】每日运势 - ' + day.dateStr,
      text: text
    }
  };

  await pushToDingtalk(msg);
}

let _job = null;

function schedulePush() {
  if (_job) { _job.cancel(); _job = null; }
  const cfg = loadConfig();
  const [h, m] = (cfg.pushTime || '06:30').split(':').map(Number);
  // Use scheduleJob with date object for precise time + timezone
  const fireDate = new Date();
  fireDate.setHours(h, m, 0, 0);
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
  schedulePush();
});
server.setTimeout(60000);
