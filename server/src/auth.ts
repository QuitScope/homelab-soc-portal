import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

// Single-user mode: one admin account, password stored only as scrypt hash in .env (ADMIN_PASSWORD_HASH).
// Reading is open inside the LAN; every write needs the session cookie.

export const COOKIE = 'soc_session';
const SESSION_MS = 8 * 3_600_000;

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `scrypt:${salt.toString('base64')}:${scryptSync(password, salt, 64).toString('base64')}`;
}

export function verifyPassword(password: string, stored: string | undefined) {
  const [scheme, salt, hash] = stored?.split(':') ?? [];
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = scryptSync(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

export const LoginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

/** Simple per-IP limiter: 5 failed logins lock the IP for 5 minutes. In-memory, so it resets on restart. */
export function createLoginLimiter(max = 5, lockMs = 300_000) {
  const fails = new Map<string, { n: number; until: number }>();
  return {
    blocked: (ip: string) => (fails.get(ip)?.until ?? 0) > Date.now(),
    fail(ip: string) {
      const f = fails.get(ip) ?? { n: 0, until: 0 };
      f.n += 1;
      if (f.n >= max) Object.assign(f, { n: 0, until: Date.now() + lockMs });
      fails.set(ip, f);
    },
    reset: (ip: string) => fails.delete(ip),
  };
}

export function sessionValue(user: string) {
  return `${user}|${Date.now() + SESSION_MS}`;
}

export function sessionUser(req: FastifyRequest): string | null {
  const raw = req.cookies[COOKIE];
  if (!raw) return null;
  const { valid, value } = req.unsignCookie(raw);
  if (!valid || !value) return null;
  const [user, exp] = value.split('|');
  return Number(exp) > Date.now() ? user : null;
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  if (!sessionUser(req)) return reply.code(401).send({ error: 'login required' });
}

export const cookieOptions = (secure: boolean) => ({
  path: '/',
  httpOnly: true,
  sameSite: 'strict' as const,
  secure,
  signed: true,
  maxAge: SESSION_MS / 1000,
});
