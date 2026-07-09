import nodemailer from 'nodemailer';

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_FROM && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function getEmailStatus() {
  const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM', 'SMTP_USER', 'SMTP_PASS'];
  const missing = required.filter(key => !process.env[key]);
  return {
    configured: missing.length === 0,
    missing,
    host: process.env.SMTP_HOST || '',
    port: process.env.SMTP_PORT || '',
    secure: process.env.SMTP_SECURE === 'true'
  };
}

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS || ''
    } : undefined,
    connectionTimeout: 30000,
    socketTimeout: 30000,
    tls: {
      rejectUnauthorized: false
    }
  });
}

function normalizeMailError(error) {
  const raw = error?.message || String(error || '');
  const lower = raw.toLowerCase();
  if (raw.includes('535') || raw.toLowerCase().includes('login fail')) {
    return new Error('QQ 邮箱 SMTP 登录失败：请确认已开启 POP3/SMTP 或 IMAP/SMTP；确认 SMTP_USER 与授权码属于同一个 QQ 邮箱；重新生成授权码后替换 SMTP_PASS；不要使用 QQ 登录密码。原始错误：' + raw);
  }
  if (raw.includes('421') || raw.includes('450') || raw.includes('451') || lower.includes('frequency') || lower.includes('busy') || lower.includes('rate')) {
    return new Error('QQ 邮箱发送太频繁或服务繁忙，请等待 1-5 分钟后再试。为了避免触发限制，请不要连续点击发送验证码。原始错误：' + raw);
  }
  return error;
}

async function sendMail(options) {
  try {
    const transporter = createTransporter();
    await transporter.sendMail(options);
  } catch (error) {
    throw normalizeMailError(error);
  }
}

export async function sendVerificationCode(email, code) {
  if (!smtpConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('邮件服务未配置，无法发送验证邮件');
    }
    console.log('[Dev Email] 邮箱验证码:', code);
    return { sent: false, devCode: code };
  }

  await sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: '八字运势推送 - 邮箱验证',
    text: `你的邮箱验证码是：${code}\n\n验证码 10 分钟内有效。如果不是你本人操作，请忽略。`,
    html: `<p>你的邮箱验证码是：</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${code}</p><p>验证码 10 分钟内有效。如果不是你本人操作，请忽略。</p>`
  });

  return { sent: true };
}

export async function sendPasswordResetCode(email, code) {
  if (!smtpConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('邮件服务未配置，无法发送找回密码验证码');
    }
    console.log('[Dev Email] 找回密码验证码:', code);
    return { sent: false, devCode: code };
  }

  await sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: '八字运势推送 - 找回密码',
    text: `你的找回密码验证码是：${code}\n\n验证码 10 分钟内有效。如果不是你本人操作，请忽略。`,
    html: `<p>你的找回密码验证码是：</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${code}</p><p>验证码 10 分钟内有效。如果不是你本人操作，请忽略。</p>`
  });

  return { sent: true };
}

export async function sendAdminTestEmail(email) {
  if (!smtpConfigured()) {
    throw new Error('邮件服务未配置，无法发送测试邮件');
  }
  await sendMail({
    from: process.env.SMTP_FROM,
    to: email || process.env.SMTP_FROM,
    subject: '八字运势推送 - SMTP 测试',
    text: '这是一封 SMTP 测试邮件。如果你收到它，说明邮箱验证码服务可以正常发送。',
    html: '<p>这是一封 SMTP 测试邮件。</p><p>如果你收到它，说明邮箱验证码服务可以正常发送。</p>'
  });
  return { sent: true };
}

export async function sendVerificationEmail(email, verificationUrl) {
  if (!smtpConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('邮件服务未配置，无法发送验证邮件');
    }
    console.log('[Dev Email] 邮箱验证链接:', verificationUrl);
    return { sent: false, devUrl: verificationUrl };
  }

  await sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: '八字运势推送 - 邮箱验证',
    text: `请打开下面链接完成邮箱验证：\n\n${verificationUrl}\n\n如果不是你本人操作，请忽略。`,
    html: `<p>请打开下面链接完成邮箱验证：</p><p><a href="${verificationUrl}">${verificationUrl}</a></p><p>如果不是你本人操作，请忽略。</p>`
  });

  return { sent: true };
}

