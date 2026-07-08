import { getDayFortune, getWeekFortune, getMonthFortune, getYearFortune } from '../bazi/engine.js';
import { pushToDingtalk } from './dingtalk.js';
import { getProfile, getPushSettings, listDuePushUsers, recordPushLog } from './users.js';

export function buildDailyPushMessage(profile, date = new Date()) {
  const day = getDayFortune(profile, date);
  const week = getWeekFortune(profile, date);
  const month = getMonthFortune(profile, date);
  const year = getYearFortune(profile, date);

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
    '---\n*八字运势推送系统 - ' + date.getFullYear() + '年' + (date.getMonth() + 1) + '月' + date.getDate() + '日*';

  return {
    msgtype: 'markdown',
    markdown: {
      title: '【运势】每日运势 - ' + day.dateStr,
      text
    }
  };
}

export async function sendDailyPushForUser(userId, date = new Date()) {
  const profile = await getProfile(userId);
  if (!profile.birthDate || !profile.birthTime) throw new Error('出生资料未完整配置');
  const push = await getPushSettings(userId, { includeSecret: true });
  if (!push.enabled || !push.webhook) throw new Error('钉钉推送未启用');
  const message = buildDailyPushMessage(profile, date);
  await pushToDingtalk(message, push.webhook);
}

export async function processDuePushes(date = new Date()) {
  const { users, today } = await listDuePushUsers(date);
  const results = [];
  for (const user of users) {
    try {
      await sendDailyPushForUser(user.id, date);
      await recordPushLog(user.id, today, user.pushTime, 'success');
      results.push({ userId: user.id, email: user.email, ok: true });
    } catch (error) {
      await recordPushLog(user.id, today, user.pushTime, 'failed', error.message);
      results.push({ userId: user.id, email: user.email, ok: false, error: error.message });
    }
  }
  return results;
}
