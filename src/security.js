import { randomBytes, createHash } from 'crypto';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

export function hashPassword(password) {
  return bcrypt.hashSync(password, SALT_ROUNDS);
}

export function comparePassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

export function generateToken(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function sessionExpiry(days = 7) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export const SESSION_COOKIE = 'outreach_session';

export function cookieOptions(remember = false) {
  const maxAge = remember ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
  };
}
