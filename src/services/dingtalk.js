import https from 'https';
import { loadConfig } from './config.js';

export async function pushToDingtalk(message) {
  const config = loadConfig();
  if (!config.webhook) {
    throw new Error('钉钉 webhook 未配置');
  }

  const data = JSON.stringify(message);
  const url = new URL(config.webhook);

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.errcode === 0) resolve(json);
          else reject(new Error(`钉钉错误: ${json.errmsg}`));
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('钉钉请求超时')); });
    req.write(data);
    req.end();
  });
}

export async function testDingtalk() {
  const msg = {
    msgtype: 'markdown',
    markdown: {
      title: '八字运势推送测试',
      text: '# 八字运势推送\n\n✅ 钉钉机器人连接测试成功！\n\n每天会自动推送运势提醒 🌟'
    }
  };
  return pushToDingtalk(msg);
}