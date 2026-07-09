import 'dotenv/config';
import { ensureSchema } from './services/db.js';
import { seedAdminUser } from './services/users.js';
import { processDuePushes } from './services/fortune-push.js';

async function main() {
  try {
    const ready = await ensureSchema();
    if (ready) {
      await seedAdminUser();
    } else {
      console.warn('未配置 DATABASE_URL，已跳过数据库初始化与管理员种子。');
    }
  } catch (err) {
    console.warn('数据库初始化失败，Cron 将跳过数据库相关任务：', err.message);
    return;
  }
  const results = await processDuePushes(new Date());
  console.log('Cron checked users:', results.length);
  for (const result of results) {
    console.log(result.ok ? 'Push OK' : 'Push failed', result.email, result.error || '');
  }
}

main().catch(err => {
  console.error('Cron push failed:', err.message);
  process.exit(1);
});
