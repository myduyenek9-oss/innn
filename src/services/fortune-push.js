import { getDayFortune, getWeekFortune, getMonthFortune, getYearFortune } from '../bazi/engine.js';
import { pushToDingtalk } from './dingtalk.js';

export function buildDailyPushMessage(date = new Date()) {
  const day = getDayFortune(date);
  const week = getWeekFortune(date);
  const month = getMonthFortune(date);
  const year = getYearFortune(date);

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

export async function sendDailyPush(date = new Date()) {
  const message = buildDailyPushMessage(date);
  await pushToDingtalk(message);
}
