import { Solar, Lunar } from 'lunar-javascript';

const WU_XING = {
  '甲':'木','乙':'木','丙':'火','丁':'火','戊':'土','己':'土',
  '庚':'金','辛':'金','壬':'水','癸':'水'
};
const SHENG = { '木':'火','火':'土','土':'金','金':'水','水':'木' };
const KE = { '木':'土','火':'金','金':'木','水':'火' };
const KE_EXTRA = { '土':'水','火':'金' };
const LIU_HE = { '子':'丑','丑':'子','寅':'亥','卯':'戌','辰':'酉','巳':'申','午':'未','未':'午','申':'巳','酉':'辰','戌':'卯','亥':'寅' };
const LIU_CHONG = { '子':'午','丑':'未','寅':'申','卯':'酉','辰':'戌','巳':'亥','午':'子','未':'丑','申':'寅','酉':'卯','戌':'辰','亥':'巳' };
const SAN_HE = { '申':'子辰','子':'申辰','辰':'申子','亥':'卯未','卯':'亥未','未':'亥卯','寅':'午戌','午':'寅戌','戌':'寅午','巳':'酉丑','酉':'巳丑','丑':'巳酉' };
const LUCKY_COLORS = ['白','金','绿','粉','黑','蓝','红','紫','棕','灰'];

function normalizeDate(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function dayOfYear(year, month, day) {
  const start = Date.UTC(year, 0, 1);
  const current = Date.UTC(year, month - 1, day);
  return Math.floor((current - start) / 86400000) + 1;
}

function equationOfTimeMinutes(year, month, day) {
  const n = dayOfYear(year, month, day);
  const b = (2 * Math.PI * (n - 81)) / 364;
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

function formatTimeFromDate(date) {
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatDateFromDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function hourBranch(hour) {
  const branches = ['子','丑','丑','寅','寅','卯','卯','辰','辰','巳','巳','午','午','未','未','申','申','酉','酉','戌','戌','亥','亥','子'];
  return branches[hour] || '';
}

function getBaseSolarDate(p) {
  if (p.calendarType === 'solar') return { year: p.year, month: p.month, day: p.day };
  const s = Lunar.fromYmdHms(p.year, p.month, p.day, 12, 0, 0).getSolar();
  return { year: s.getYear(), month: s.getMonth(), day: s.getDay() };
}

function datePartsFromUTC(date) {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes()
  };
}

function applyZiDayBoundary(date) {
  if (date.getUTCHours() < 23) return { date, changed: false };
  return { date: new Date(date.getTime() + 60 * 60000), changed: true };
}

export function getTrueSolarTimeInfo(profile) {
  const p = parseProfile(profile);
  const longitude = Number(profile.longitude);
  if (!Number.isFinite(longitude)) {
    return {
      enabled: false,
      inputTime: `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`,
      trueSolarTime: `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`,
      correctionMinutes: 0,
      equationMinutes: 0,
      longitudeCorrectionMinutes: 0,
      crossedHourBranch: false,
      note: '未选择带经纬度的县区，暂按北京时间排盘。'
    };
  }

  const baseSolar = getBaseSolarDate(p);
  const equation = equationOfTimeMinutes(baseSolar.year, baseSolar.month, baseSolar.day);
  const longitudeCorrection = (longitude - 120) * 4;
  const correction = longitudeCorrection + equation;
  const originalDate = new Date(Date.UTC(baseSolar.year, baseSolar.month - 1, baseSolar.day, p.hour, p.minute, 0));
  const trueDate = new Date(originalDate.getTime() + Math.round(correction * 60000));
  const originalBranch = hourBranch(p.hour);
  const trueBranch = hourBranch(trueDate.getUTCHours());

  return {
    enabled: true,
    longitude,
    latitude: Number(profile.latitude),
    inputTime: `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`,
    trueSolarTime: formatTimeFromDate(trueDate),
    trueSolarDate: `${trueDate.getUTCFullYear()}-${String(trueDate.getUTCMonth() + 1).padStart(2, '0')}-${String(trueDate.getUTCDate()).padStart(2, '0')}`,
    correctionMinutes: Math.round(correction),
    equationMinutes: Number(equation.toFixed(2)),
    longitudeCorrectionMinutes: Number(longitudeCorrection.toFixed(2)),
    crossedHourBranch: originalBranch !== trueBranch,
    originalHourBranch: originalBranch,
    trueHourBranch: trueBranch,
    note: originalBranch !== trueBranch ? `真太阳时已从${originalBranch}时跨入${trueBranch}时。` : '真太阳时未跨时辰。'
  };
}

function parseProfile(profile) {
  if (!profile?.birthDate) throw new Error('请先填写出生日期');
  const [year, month, day] = normalizeDate(profile.birthDate).split('-').map(Number);
  const [hour, minute] = (profile.birthTime || '06:00').split(':').map(Number);
  return {
    year, month, day,
    hour: Number.isFinite(hour) ? hour : 6,
    minute: Number.isFinite(minute) ? minute : 0,
    calendarType: profile.calendarType === 'solar' ? 'solar' : 'lunar',
    baziRule: profile.baziRule === 'true_solar' ? 'true_solar' : 'beijing_zi_day',
    gender: profile.gender || 'male',
    location: profile.location || '',
    longitude: profile.longitude,
    latitude: profile.latitude
  };
}

export function buildBazi(profile) {
  const p = parseProfile(profile);
  const solarInfo = getTrueSolarTimeInfo(profile);
  let adjustedSolarDate = null;
  let basisDate = null;
  const baseSolar = getBaseSolarDate(p);

  if (p.baziRule === 'true_solar' && solarInfo.enabled) {
    const [sy, sm, sd] = solarInfo.trueSolarDate.split('-').map(Number);
    const [sh, smin] = solarInfo.trueSolarTime.split(':').map(Number);
    basisDate = new Date(Date.UTC(sy, sm - 1, sd, sh, smin, 0));
  } else {
    basisDate = new Date(Date.UTC(baseSolar.year, baseSolar.month - 1, baseSolar.day, p.hour, p.minute, 0));
  }

  const ziBoundary = applyZiDayBoundary(basisDate);
  adjustedSolarDate = datePartsFromUTC(ziBoundary.date);
  const lunar = Solar.fromYmdHms(adjustedSolarDate.year, adjustedSolarDate.month, adjustedSolarDate.day, adjustedSolarDate.hour, adjustedSolarDate.minute, 0).getLunar();
  const e = lunar.getEightChar();
  const originalBranch = hourBranch(p.hour);
  const basisBranch = hourBranch(basisDate.getUTCHours());
  const effectiveBranch = hourBranch(adjustedSolarDate.hour);
  const calculation = {
    rule: p.baziRule,
    ruleName: p.baziRule === 'true_solar' ? '真太阳时 + 子初换日' : '北京时间 + 子初换日',
    inputDate: `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`,
    inputTime: `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`,
    baseSolarDate: `${baseSolar.year}-${String(baseSolar.month).padStart(2, '0')}-${String(baseSolar.day).padStart(2, '0')}`,
    basisDate: formatDateFromDate(basisDate),
    basisTime: formatTimeFromDate(basisDate),
    effectiveDate: `${adjustedSolarDate.year}-${String(adjustedSolarDate.month).padStart(2, '0')}-${String(adjustedSolarDate.day).padStart(2, '0')}`,
    effectiveTime: `${String(adjustedSolarDate.hour).padStart(2, '0')}:${String(adjustedSolarDate.minute).padStart(2, '0')}`,
    originalHourBranch: originalBranch,
    basisHourBranch: basisBranch,
    effectiveHourBranch: effectiveBranch,
    ziDayBoundary: ziBoundary.changed,
    note: ziBoundary.changed ? '已按子初换日：23:00 后日柱按次日计算。' : '未触发子初换日。'
  };
  return {
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
    gender: p.gender,
    trueSolar: solarInfo,
    calculation
  };
}

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

function getDayScore(dayGZ, bazi) {
  if (!dayGZ || dayGZ.length < 2) return 55;
  const dayGan = dayGZ[0];
  const dayZhi = dayGZ[1];
  const myDayGan = bazi?.dayGan || '壬';
  const myDayZhi = bazi?.dayZhi || '戌';
  const myMonthZhi = bazi?.monthZhi || '寅';
  const myWuXing = WU_XING[myDayGan];
  const dayWuXing = WU_XING[dayGan];
  let score = 55 + getGanStrength(myDayGan, myMonthZhi);
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
  if (score >= 82) return { level:'大吉', icon:'🔴', desc:'万事顺遂、贵人相助', advice:'宜主动推进关键事项，抓住机会，扩展格局' };
  if (score >= 70) return { level:'吉', icon:'🟡', desc:'诸事较顺、心气舒展', advice:'宜主动沟通、推进计划、建立合作' };
  if (score >= 58) return { level:'中吉', icon:'🟢', desc:'平稳向好、稳中有进', advice:'宜稳扎稳打，专注核心工作，保持节奏' };
  if (score >= 46) return { level:'中平', icon:'⚪', desc:'如常运转、无大波澜', advice:'宜守不宜攻，劳逸结合，耐心等待' };
  if (score >= 32) return { level:'中凶', icon:'🟠', desc:'宜守不宜动、谨言慎行', advice:'避免激进决策，减少冲突，控制风险' };
  return { level:'凶', icon:'⚫', desc:'诸事谨慎、宜静不宜动', advice:'大事不宜，养精蓄锐，规避风险' };
}

function getLuckyColor(gan) {
  return LUCKY_COLORS[gan.charCodeAt(0) % LUCKY_COLORS.length];
}

function getSolarDayGZ(date) {
  const s = Solar.fromYmdHms(date.getFullYear(), date.getMonth() + 1, date.getDate(), 12, 0, 0);
  return s.getLunar().getDayInGanZhi();
}

function getFlowMonthGZ(date) {
  const s = Solar.fromYmdHms(date.getFullYear(), date.getMonth() + 1, date.getDate(), 12, 0, 0);
  return s.getLunar().getMonthInGanZhiExact();
}

function getFlowYearGZ(date) {
  const s = Solar.fromYmdHms(date.getFullYear(), date.getMonth() + 1, date.getDate(), 12, 0, 0);
  return s.getLunar().getYearInGanZhiExact();
}

function toLunar(date) {
  const s = Solar.fromYmdHms(date.getFullYear(), date.getMonth() + 1, date.getDate(), 12, 0, 0);
  const l = s.getLunar();
  return { zodiac: l.getYearShengXiao(), month: l.getMonthInChinese(), day: l.getDayInChinese() };
}

function buildDayContent(score, dayGZ, date, bazi) {
  const info = scoreToInfo(score);
  const lucky = getLuckyColor(dayGZ[0]);
  const ld = toLunar(date);
  const weekday = ['周日','周一','周二','周三','周四','周五','周六'][date.getDay()];
  const myWu = WU_XING[bazi.dayGan];
  const dayWu = WU_XING[dayGZ[0]] || '';
  let relation = '今日五行与日主关系平稳，宜按计划推进。';
  if (SHENG[myWu] === dayWu) relation = `今日流日五行生助表达与输出（${myWu}生${dayWu}），适合展示、沟通、推进。`;
  else if (KE[myWu] === dayWu || KE_EXTRA[myWu] === dayWu) relation = `今日流日对日主形成压力（${myWu}克${dayWu}），宜稳住节奏，少做冒进决定。`;
  else if (myWu === dayWu) relation = `今日与日主同气（${myWu}），状态平稳，适合整理和巩固。`;

  return `${info.icon} **综合评分：${score}分 · ${info.level}**

${weekday} · ${ld.zodiac}年${ld.month}月${ld.day}
今日日柱 **${dayGZ}**

> ${info.desc}

**今日建议：**
> ${info.advice}

**幸运提示：**
- 幸运色：${lucky}
- 吉时参考：午时(11-13时)、酉时(17-19时)

**今日特别提示：**
- ${relation}`;
}

function buildWeekContent(avgScore, todayDate, bazi) {
  const d = todayDate || new Date();
  const dow = d.getDay() || 7;
  const weekStart = new Date(d);
  weekStart.setDate(d.getDate() - dow + 1);
  const info = scoreToInfo(avgScore);
  let text = `${info.icon} **本周综合：${avgScore}分 · ${info.level}**

**本周各日运势：**

| 日期 | 星期 | 日柱 | 分数 | 吉凶 |
| --- | --- | --- | --- | --- |
`;
  for (let i = 0; i < 7; i++) {
    const dd = new Date(weekStart);
    dd.setDate(weekStart.getDate() + i);
    const dg = getSolarDayGZ(dd);
    const sc = getDayScore(dg, bazi);
    const scInfo = scoreToInfo(sc);
    const dayName = ['周日','周一','周二','周三','周四','周五','周六'][dd.getDay()];
    const isToday = dd.toDateString() === d.toDateString();
    const dateText = `${isToday ? '🔴 ' : ''}${dd.getMonth() + 1}月${dd.getDate()}日`;
    text += `| ${dateText} | ${dayName} | ${dg} | **${sc}分** | ${scInfo.icon} ${scInfo.level} |\n`;
  }
  text += `\n**本周注意：** ${avgScore >= 60 ? '宜主动推进、稳定输出，适合把计划拆成小步执行。' : '宜减少冒进，先整理、复盘、修正节奏。'}\n`;
  return text;
}

function buildMonthContent(score, year, month, flowMonthGZ) {
  const info = scoreToInfo(score);
  const monthNames = ['','正月','二月','三月','四月','五月','六月','七月','八月','九月','十月','冬月','腊月'];
  return `${info.icon} **${year}年${monthNames[month] || `${month}月`}：${score}分 · ${info.level}**

**本月依据：** 当前流月 **${flowMonthGZ}**

**月令总论：**
- ${score >= 70 ? '本月运势较旺，适合制定计划并主动推进。' : score >= 52 ? '本月整体平稳，宜稳扎稳打、步步为营。' : '本月宜保守稳健，重心放在自我提升与风险控制。'}

**本月注意：** ${score < 50 ? '避免争执、冲动投资和高风险决定。' : '合理作息，防微杜渐，把握合适机会。'}`;
}

function buildYearContent(score, year, flowYearGZ, date, bazi) {
  const info = scoreToInfo(score);
  let text = `${info.icon} **${year}年综合：${score}分 · ${info.level}**

**本年依据：** 当前流年 **${flowYearGZ}**

**年度总论：**
- ${score >= 70 ? '今年整体有利于扩展和推进，适合定长期目标。' : score >= 52 ? '今年适合巩固基础、积累资源、稳中求进。' : '今年宜保守稳健，重点放在修整、学习和降低风险。'}

**全年流月速览：**

| 月份 | 流月 | 分数 | 判断 | 提醒 |
| --- | --- | --- | --- | --- |
`;
  for (let m = 1; m <= 12; m++) {
    const l = Solar.fromYmdHms(year, m, 15, 12, 0, 0).getLunar();
    const flowMonth = l.getMonthInGanZhiExact();
    const sc = getDayScore(flowMonth, bazi);
    const monthInfo = scoreToInfo(sc);
    const tip = sc >= 70 ? '适合推进' : sc >= 52 ? '稳中求进' : sc >= 36 ? '保守稳健' : '谨慎避险';
    text += `| ${m}月 | ${flowMonth} | **${sc}分** | ${monthInfo.icon} ${monthInfo.level} | ${tip} |\n`;
  }
  text += '\n说明：本表按每个月的流月干支计算，和今日/本周流日分数不是同一层级。';
  return text;
}

export function getDayFortune(profile, date = new Date()) {
  const bazi = buildBazi(profile);
  const dayGZ = getSolarDayGZ(date);
  const ld = toLunar(date);
  const score = getDayScore(dayGZ, bazi);
  return {
    dateStr: date.toLocaleDateString('zh-CN', { year:'numeric', month:'2-digit', day:'2-digit' }),
    lunarStr: `${ld.zodiac}年${ld.month}月${ld.day}`,
    score,
    content: buildDayContent(score, dayGZ, date, bazi),
    bazi
  };
}

export function getWeekFortune(profile, date = new Date()) {
  const bazi = buildBazi(profile);
  const dow = date.getDay() || 7;
  const weekStart = new Date(date);
  weekStart.setDate(date.getDate() - dow + 1);
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const dd = new Date(weekStart);
    dd.setDate(weekStart.getDate() + i);
    total += getDayScore(getSolarDayGZ(dd), bazi);
  }
  const avg = Math.round(total / 7);
  return { score: avg, content: buildWeekContent(avg, date, bazi) };
}

export function getMonthFortune(profile, date = new Date()) {
  const bazi = buildBazi(profile);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const flowMonthGZ = getFlowMonthGZ(date);
  const score = getDayScore(flowMonthGZ, bazi);
  return { score, content: buildMonthContent(score, year, month, flowMonthGZ) };
}

export function getYearFortune(profile, date = new Date()) {
  const bazi = buildBazi(profile);
  const year = date.getFullYear();
  const flowYearGZ = getFlowYearGZ(date);
  const score = getDayScore(flowYearGZ, bazi);
  return { score, content: buildYearContent(score, year, flowYearGZ, date, bazi) };
}
