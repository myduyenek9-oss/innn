import jwt from 'jsonwebtoken';
import { getUserById, publicUser } from './users.js';

const COOKIE_NAME = 'fortune_auth';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function jwtSecret() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET 未配置');
  return process.env.JWT_SECRET;
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(header.split(';').map(part => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
  }).filter(([key]) => key));
}

export function signAuthToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    jwtSecret(),
    { expiresIn: '7d' }
  );
}

export function setAuthCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production';
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(MAX_AGE_MS / 1000)}`
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export async function optionalAuth(req, res, next) {
  try {
    const token = parseCookies(req)[COOKIE_NAME];
    if (!token) {
      req.user = null;
      return next();
    }
    const payload = jwt.verify(token, jwtSecret());
    const user = await getUserById(payload.sub);
    req.user = user || null;
    return next();
  } catch {
    req.user = null;
    return next();
  }
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ ok: false, msg: '请先登录' });
  }
  if (req.user.disabled) {
    clearAuthCookie(res);
    return res.status(403).json({ ok: false, msg: '账号已被禁用，请联系管理员' });
  }
  if (!req.user.email_verified) {
    return res.status(403).json({ ok: false, msg: '邮箱未验证' });
  }
  return next();
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ ok: false, msg: '需要管理员权限' });
    }
    return next();
  });
}

export function currentUserResponse(user) {
  return publicUser(user);
}
