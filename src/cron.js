import { initBazi } from './bazi/engine.js';
import { sendDailyPush } from './services/fortune-push.js';

async function main() {
  const ok = initBazi();
  if (!ok) {
    throw new Error('八字初始化失败，请检查出生信息配置');
  }
  await sendDailyPush(new Date());
  console.log('Cron push OK');
}

main().catch(err => {
  console.error('Cron push failed:', err.message);
  process.exit(1);
});
