import { getDayFortune, getWeekFortune, getMonthFortune, getYearFortune } from '../bazi/engine.js';
import { clearMessages, getRecentMessages, isDatabaseConfigured, saveMessage } from './agent-store.js';

const MAX_QUESTION_LENGTH = 800;

export function getAgentStatus() {
  const aiConfigured = Boolean(process.env.AI_API_KEY && process.env.AI_MODEL);
  const dbConfigured = isDatabaseConfigured();
  const missing = [];
  if (!process.env.AI_API_KEY) missing.push('AI_API_KEY');
  if (!process.env.AI_MODEL) missing.push('AI_MODEL');
  if (!dbConfigured) missing.push('DATABASE_URL');
  return {
    enabled: aiConfigured && dbConfigured,
    aiConfigured,
    dbConfigured,
    baseUrl: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.AI_MODEL || '',
    missing
  };
}

function compact(text, max = 1200) {
  if (!text) return '';
  const clean = String(text).replace(/\n{3,}/g, '\n\n').trim();
  return clean.length > max ? clean.slice(0, max) + '\n...' : clean;
}

function buildFortuneContext(date = new Date()) {
  const day = getDayFortune(date);
  const week = getWeekFortune(date);
  const month = getMonthFortune(date);
  const year = getYearFortune(date);
  const bazi = day.bazi || {};

  return [
    `当前日期：${day.dateStr}`,
    `农历：${day.lunarStr}`,
    `用户固定八字：${bazi.yearGZ || '甲申'} ${bazi.monthGZ || '丙寅'} ${bazi.dayGZ || '壬戌'} ${bazi.timeGZ || '癸卯'}`,
    `纳音：${bazi.yearNaYin || '泉中水'} / ${bazi.monthNaYin || '炉中火'} / ${bazi.dayNaYin || '大海水'} / ${bazi.timeNaYin || '金箔金'}`,
    '计算边界：今日=流日；本周=本周7天流日平均；本月=当前流月；本年=当前流年；年度表=12个流月。',
    `今日分数：${day.score}`,
    `本周分数：${week.score}`,
    `本月分数：${month.score}`,
    `本年分数：${year.score}`,
    `今日内容：${compact(day.content, 900)}`,
    `本周内容：${compact(week.content, 900)}`,
    `本月内容：${compact(month.content, 700)}`,
    `本年内容：${compact(year.content, 900)}`
  ].join('\n');
}

function buildSystemPrompt(date = new Date()) {
  return `你是一个八字运势与行动计划 Agent。你只基于系统提供的八字、流日/流月/流年运势和用户问题回答。

要求：
1. 回答要用中文，简洁、具体、可执行。
2. 必须尊重计算边界：每日看流日，本周看7天流日平均，本月看流月，本年看流年。不要把不同层级的分数混成同一件事。
3. 用户八字固定为：甲申 丙寅 壬戌 癸卯；出生信息为农历2004年1月23日早上06:30，福建泉州，男。
4. 可以给学习、工作、作息、沟通、出行、决策节奏等行动建议。
5. 不要承诺绝对结果，不做医疗、法律、投资结论；遇到高风险问题要提醒理性判断。
6. 如果用户问“为什么分数不同”，解释不同层级对应不同干支与计算口径。

当前运势上下文：
${buildFortuneContext(date)}`;
}

function normalizeHistory(rows) {
  return rows.map(row => ({
    role: row.role,
    content: compact(row.content, 1200)
  }));
}

async function callCompatibleChat(messages) {
  const status = getAgentStatus();
  if (!status.aiConfigured) {
    throw new Error('AI 未启用，请在 Railway Variables 配置 AI_API_KEY 和 AI_MODEL');
  }

  const baseUrl = status.baseUrl.replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.AI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL,
      messages,
      temperature: Number(process.env.AI_TEMPERATURE || 0.3),
      max_tokens: Number(process.env.AI_MAX_TOKENS || 900)
    })
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`AI 返回格式异常: ${text.slice(0, 160)}`);
  }

  if (!response.ok) {
    const msg = json?.error?.message || json?.message || response.statusText;
    throw new Error(`AI 请求失败: ${msg}`);
  }

  const answer = json?.choices?.[0]?.message?.content;
  if (!answer) throw new Error('AI 没有返回有效回答');
  return answer.trim();
}

export async function getAgentHistory() {
  const status = getAgentStatus();
  if (!status.dbConfigured) {
    return { ...status, messages: [], notice: 'DATABASE_URL 未配置，聊天记录未启用' };
  }
  const messages = await getRecentMessages(30);
  return { ...status, messages };
}

export async function clearAgentHistory() {
  const status = getAgentStatus();
  if (!status.dbConfigured) {
    throw new Error('DATABASE_URL 未配置，无法清空聊天记录');
  }
  await clearMessages();
}

export async function chatWithAgent(question, date = new Date()) {
  const status = getAgentStatus();
  if (!status.enabled) {
    throw new Error(`Agent 未启用，缺少配置：${status.missing.join(', ')}`);
  }

  const cleanQuestion = String(question || '').trim();
  if (!cleanQuestion) throw new Error('请输入问题');
  if (cleanQuestion.length > MAX_QUESTION_LENGTH) {
    throw new Error(`问题太长，请控制在 ${MAX_QUESTION_LENGTH} 字以内`);
  }

  const history = await getRecentMessages(30);
  const messages = [
    { role: 'system', content: buildSystemPrompt(date) },
    ...normalizeHistory(history),
    { role: 'user', content: cleanQuestion }
  ];

  const answer = await callCompatibleChat(messages);
  await saveMessage('user', cleanQuestion, date);
  await saveMessage('assistant', answer, date);
  return { answer };
}
