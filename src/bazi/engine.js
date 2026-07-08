import { Solar, Lunar } from 'lunar-javascript';
import { loadConfig } from '../services/config.js';

let _bazi = null;

const WU_XING = {
  '甲':'木','乙':'木','丙':'火','丁':'火','戊':'土','己':'土',
  '庚':'金','辛':'金','壬':'水','癸':'水'
};
const SHENG = { '木':'火','火':'土','土':'金','金':'水','水':'木' };
const KE = { '木':'土','火':'金','金':'木','水':'火' };
const KE_EXTRA = { '土':'水','火':'金' };
const LUCKY_COLORS = ['白','金','绿','粉','黑','蓝','红','紫','棕','灰'];

function getGanStrength(myDayGan, monthZhi) {
  if (!myDayGan || !monthZhi) return 0;
  const monthWuXing = WU_XING[monthZhi] || '';
  const myWuXing = WU_XING[myDayGan];
  if (!myWuXing) return 0;
  if (myWuXing === SHENG[monthWuXing]) return 20;
  if (myWuXing === monthWuXing) return 15;
  if (myWuXing === SHENG[myWuXing]) return -5;
  if (Object.keys(SHENG).find(k => KE[k] === myWuXing && SHENG[monthWuXing] === k)) return -15;
  return -10;
}

const LIU_HE = { '子':'丑','丑':'子','寅':'亥','卯':'戌','辰':'酉','巳':'申','午':'未','未':'午','申':'巳','酉':'辰','戌':'卯','亥':'寅' };
const LIU_CHONG = { '子':'午','丑':'未','寅':'申','卯':'酉','辰':'戌','巳':'亥','午':'子','未':'丑','申':'寅','酉':'卯','戌':'辰','亥':'巳' };
const SAN_HE = { '申':'子辰','子':'申辰','辰':'申子','亥':'卯未','卯':'亥未','未':'亥卯','寅':'午戌','午':'寅戌','戌':'寅午','巳':'酉丑','酉':'巳丑','丑':'巳酉' };

function getDayScore(dayGZ, myBazi) {
  if (!dayGZ || dayGZ.length < 2) return 55;
  const dayGan = dayGZ[0];
  const dayZhi = dayGZ[1];
  if (!dayGan) return 55;
  const myDayGan   = myBazi ? myBazi.dayGan   : '壬';
  const myDayZhi   = myBazi ? myBazi.dayZhi   : '戌';
  const myMonthZhi = myBazi ? myBazi.monthZhi : '寅';
  const myWuXing   = WU_XING[myDayGan];
  const dayWuXing  = WU_XING[dayGan];
  let score = 55;
  if (myBazi) score += getGanStrength(myDayGan, myMonthZhi);
  if (SHENG[myWuXing] === dayWuXing) score += 18;
  else if (KE[myWuXing] === dayWuXing || KE_EXTRA[myWuXing] === dayWuXing) score -= 15;
  else if (myWuXing === dayWuXing) score += 8;
  if (dayZhi === myDayZhi) score += 10;
  if (LIU_HE[myDayZhi] === dayZhi) score += 12;
  if (LIU_CHONG[myDayZhi] === dayZhi) score -= 15;
  if (SAN_HE[myDayZhi] && SAN_HE[myDayZhi].includes(dayZhi)) score += 6;
  return Math.max(18, Math.min(97, score));
}

function scoreToInfo(score) {
  if (score >= 82) return { level:'大吉', icon:'🔴', desc:'万事顺遂、贵人相助', advice:'宜大胆行动、抓住机遇、拓展格局' };
  if (score >= 70) return { level:'吉',   icon:'🟡', desc:'诸事顺利、心情愉悦', advice:'宜主动出击、拓展人脉、推进计划' };
  if (score >= 58) return { level:'中吉', icon:'🟢', desc:'平稳向好、稳中有进', advice:'宜稳扎稳打、专注核心工作、保持节奏' };
  if (score >= 46) return { level:'中平', icon:'⚪', desc:'如常运转、无大波澜', advice:'宜守不宜攻、劳逸结合、耐心等待' };
  if (score >= 32) return { level:'中凶', icon:'🟠', desc:'宜守不宜动、谨言慎行', advice:'避免激进决策、减少社交活动、控制风险' };
  return            { level:'凶',   icon:'⚫', desc:'诸事谨慎、宜静不宜动', advice:'大事不宜、养精蓄锐、规避风险、修身养性' };
}

function getLuckyColor(gan) { return LUCKY_COLORS[gan.charCodeAt(0) % LUCKY_COLORS.length]; }

function getSolarDayGZ(date) {
  const s = Solar.fromYmdHms(date.getFullYear(), date.getMonth()+1, date.getDate(), 12, 0, 0);
  return s.getLunar().getDayInGanZhi();
}

function getFlowMonthGZ(date) {
  const s = Solar.fromYmdHms(date.getFullYear(), date.getMonth()+1, date.getDate(), 12, 0, 0);
  return s.getLunar().getMonthInGanZhiExact();
}

function getFlowYearGZ(date) {
  const s = Solar.fromYmdHms(date.getFullYear(), date.getMonth()+1, date.getDate(), 12, 0, 0);
  return s.getLunar().getYearInGanZhiExact();
}

function toLunar(date) {
  const s = Solar.fromYmdHms(date.getFullYear(), date.getMonth()+1, date.getDate(), 12, 0, 0);
  const l = s.getLunar();
  return { zodiac: l.getYearShengXiao(), month: l.getMonthInChinese(), day: l.getDayInChinese() };
}

function buildDayContent(score, dayGZ, date) {
  const d = date || new Date();
  const info = scoreToInfo(score);
  const lucky = getLuckyColor(dayGZ[0]);
  const ld = toLunar(d);
  const weekday = ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()];
  let text = info.icon + ' **综合评分：' + score + '分 · ' + info.level + '**\n\n';
  text += weekday + ' · ' + ld.zodiac + '年 ' + ld.month + '月' + ld.day + '\n';
  text += '今日日柱 **' + dayGZ + '**\n\n';
  text += '> ' + info.desc + '\n\n';
  text += '**今日建议：**\n> ' + info.advice + '\n\n';
  text += '**幸运提示：**\n';
  text += '· 幸运色：' + lucky + '\n';
  text += '· 吉时参考：午时(11-13时)、酉时(17-19时)\n';
  if (_bazi) {
    const dayWu = WU_XING[dayGZ[0]] || '';
    const myWu = WU_XING[_bazi.dayGan];
    if (SHENG[myWu] === dayWu) {
      text += '\n**今日特别提示：**\n';
      text += '· 今日日干生我之气（' + myWu + '生' + dayWu + '），精力充沛，利于表达\n';
    } else if (KE[myWu] === dayWu || KE_EXTRA[myWu] === dayWu) {
      text += '\n**今日特别提示：**\n';
      text += '· 今日日干克我之气（' + myWu + '克' + dayWu + '），压力较大，宜冷静处事\n';
    } else if (myWu === dayWu) {
      text += '\n**今日特别提示：**\n';
      text += '· 今日日干与我同气（' + myWu + '），状态平稳\n';
    }
  }
  return text;
}

function buildWeekContent(avgScore, todayDate) {
  const d = todayDate || new Date();
  const dow = d.getDay() || 7;
  const weekStart = new Date(d);
  weekStart.setDate(d.getDate() - dow + 1);
  const info = scoreToInfo(avgScore);
  let text = info.icon + ' **本周综合：' + avgScore + '分 · ' + info.level + '**\n\n';
  text += '**本周各日运势：**\n\n';
  text += '| 日期 | 星期 | 日柱 | 分数 | 吉凶 |\n';
  text += '| --- | --- | --- | --- | --- |\n';
  for (let i = 0; i < 7; i++) {
    const dd = new Date(weekStart); dd.setDate(weekStart.getDate() + i);
    const dg = getSolarDayGZ(dd);
    const sc = getDayScore(dg, _bazi);
    const scInfo = scoreToInfo(sc);
    const dayName = ['周日','周一','周二','周三','周四','周五','周六'][dd.getDay()];
    const isToday = dd.toDateString() === d.toDateString();
    const dateText = (isToday ? '🔴 ' : '') + (dd.getMonth()+1) + '月' + dd.getDate() + '日';
    text += '| ' + dateText + ' | ' + dayName + ' | ' + dg + ' | **' + sc + '分** | ' + scInfo.icon + ' ' + scInfo.level + ' |\n';
  }
  const weekTotal = Array.from({length:7},(_,i) => { const dd = new Date(weekStart); dd.setDate(weekStart.getDate()+i); return getDayScore(getSolarDayGZ(dd), _bazi); }).reduce((a,b) => a+b, 0);
  const weekAvg = Math.round(weekTotal / 7);
  text += '\n**本周注意：** ' + (weekAvg >= 60 ? '宜创新、拓展、社交，积极主动' : '宜学习、整理、养生，稳扎稳打') + '\n';
  return text;
}

function buildMonthContent(score, year, month, flowMonthGZ) {
  const info = scoreToInfo(score);
  const monthNames = ['','正月','二月','三月','四月','五月','六月','七月','八月','九月','十月','冬月','腊月'];
  let text = info.icon + ' **' + year + '年' + monthNames[month] + '：' + score + '分 · ' + info.level + '**\n\n';
  text += '**本月依据：** 当前流月 **' + flowMonthGZ + '**\n\n';
  text += '**月令总论：**\n';
  text += score >= 70 ? '· 本月是运势旺盛之月，宜制定大计划、敢于作为\n' :
          score >= 52 ? '· 本月整体顺遂，宜稳扎稳打、步步为营\n' :
                          '· 本月需以保守稳健为主，重心放在自我提升上\n';
  text += '\n**本月注意：** ' + (score < 50 ? '避免争吵、风险投资、低调行事' : '合理作息、防微杜渐、把握机遇') + '\n';
  return text;
}

function buildYearContent(score, year, flowYearGZ, date = new Date()) {
  const info = scoreToInfo(score);
  let text = info.icon + ' **' + year + '年综合：' + score + '分 · ' + info.level + '**\n\n';
  text += '**本年依据：** 当前流年 **' + flowYearGZ + '**\n\n';
  text += '**年度总论：**\n';
  if (score >= 70) {
    text += '· 今年是运势旺盛之年，宜制定大计划、敢于作为\n';
    text += '· 事业与财运有较大提升机会\n';
  } else if (score >= 52) {
    text += '· 今年整体顺遂，宜稳扎稳打、步步为营\n';
    text += '· 适合巩固基础、积累资源\n';
  } else {
    text += '· 今年需以保守稳健为主\n';
    text += '· 重心放在自我提升和内在修炼上\n';
  }
  text += '\n**全年流月速览：**\n\n';
  text += '| 月份 | 流月 | 分数 | 判断 | 提醒 |\n';
  text += '| --- | --- | --- | --- | --- |\n';
  for (let m = 1; m <= 12; m++) {
    try {
      const l = Solar.fromYmdHms(year, m, 15, 12, 0, 0).getLunar();
      const flowMonth = l.getMonthInGanZhiExact();
      const sc = getDayScore(flowMonth, _bazi);
      const monthInfo = scoreToInfo(sc);
      const tip = sc >= 70 ? '适合推进' : sc >= 52 ? '稳中求进' : sc >= 36 ? '保守稳健' : '谨慎避险';
      text += '| ' + m + '月 | ' + flowMonth + ' | **' + sc + '分** | ' + monthInfo.icon + ' ' + monthInfo.level + ' | ' + tip + ' |\n';
    } catch(e) {}
  }
  text += '\n说明：本表按每个月的流月干支计算，和今日/本周流日分数不是同一层级。\n';
  return text;
}

export function initBazi() {
  const cfg = loadConfig();
  if (!cfg.birthDate) {
    console.warn('出生日期未配置，请先在网页上填写');
    return false;
  }
  const [y, mo, da] = cfg.birthDate.split('-').map(Number);
  const [h, mi] = (cfg.birthTime || '06:00').split(':').map(Number);
  const lunar = Lunar.fromYmdHms(y, mo, da, h, mi, 0);
  const e = lunar.getEightChar();
  _bazi = {
    yearGan: e.getYearGan(), yearZhi: e.getYearZhi(),
    monthGan: e.getMonthGan(), monthZhi: e.getMonthZhi(),
    dayGan: e.getDayGan(), dayZhi: e.getDayZhi(),
    timeGan: e.getTimeGan(), timeZhi: e.getTimeZhi(),
    yearGZ: e.getYearGan() + e.getYearZhi(),
    monthGZ: e.getMonthGan() + e.getMonthZhi(),
    dayGZ: e.getDayGan() + e.getDayZhi(),
    timeGZ: e.getTimeGan() + e.getTimeZhi(),
    yearNaYin: e.getYearNaYin(), monthNaYin: e.getMonthNaYin(),
    dayNaYin: e.getDayNaYin(), timeNaYin: e.getTimeNaYin(),
    yearShiShen: e.getYearShiShenGan(), monthShiShen: e.getMonthShiShenGan(),
    dayShiShen: e.getDayShiShenGan(), timeShiShen: e.getTimeShiShenGan(),
    yearZodiac: lunar.getYearShengXiao(),
    gender: cfg.gender || 'male'
  };
  console.log('八字已初始化:', _bazi.yearGZ, _bazi.monthGZ, _bazi.dayGZ, _bazi.timeGZ);
  return true;
}

export function getDayFortune(date) {
  const d = date || new Date();
  const dgz = getSolarDayGZ(d);
  const ld = toLunar(d);
  const score = getDayScore(dgz, _bazi);
  return {
    dateStr: d.toLocaleDateString('zh-CN', { year:'numeric', month:'2-digit', day:'2-digit' }),
    lunarStr: ld.zodiac + '年' + ld.month + '月' + ld.day,
    score,
    content: buildDayContent(score, dgz, d),
    bazi: _bazi ? {
      yearGZ: _bazi.yearGZ, monthGZ: _bazi.monthGZ, dayGZ: _bazi.dayGZ, timeGZ: _bazi.timeGZ,
      yearNaYin: _bazi.yearNaYin, monthNaYin: _bazi.monthNaYin, dayNaYin: _bazi.dayNaYin, timeNaYin: _bazi.timeNaYin,
      dayShiShen: _bazi.dayShiShen, timeShiShen: _bazi.timeShiShen, yearZodiac: _bazi.yearZodiac
    } : null
  };
}

export function getWeekFortune(date) {
  const d = date || new Date();
  const dow = d.getDay() || 7;
  const weekStart = new Date(d);
  weekStart.setDate(d.getDate() - dow + 1);
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const dd = new Date(weekStart); dd.setDate(weekStart.getDate() + i);
    total += getDayScore(getSolarDayGZ(dd), _bazi);
  }
  const avg = Math.round(total / 7);
  return { score: avg, content: buildWeekContent(avg, d) };
}

export function getMonthFortune(date) {
  const d = date || new Date();
  const year = d.getFullYear(), month = d.getMonth() + 1;
  const flowMonthGZ = getFlowMonthGZ(d);
  const score = getDayScore(flowMonthGZ, _bazi);
  return { score, content: buildMonthContent(score, year, month, flowMonthGZ) };
}

export function getYearFortune(date) {
  const d = date || new Date();
  const year = d.getFullYear();
  const flowYearGZ = getFlowYearGZ(d);
  const score = getDayScore(flowYearGZ, _bazi);
  return { score, content: buildYearContent(score, year, flowYearGZ, d) };
}
