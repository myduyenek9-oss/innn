import 'dotenv/config';
import { ensureSchema } from './services/db.js';
import { seedAdminUser } from './services/users.js';
import { processDuePushes } from './services/fortune-push.js';

async function main() {
  await ensureSchema();
  await seedAdminUser();
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
