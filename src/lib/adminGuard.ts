import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';

type RateBucket = {
  tokens: number;
  lastRefill: number; // epoch ms
};

declare global {
  // eslint-disable-next-line no-var
  var __rateLimits: Map<string, RateBucket> | undefined;
}

function getClientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  return '127.0.0.1';
}

export async function isAdminRequest(request: Request): Promise<boolean> {
  // API Key erlaubt Server-zu-Server ohne Session
  const apiKey = process.env.ADMIN_API_KEY?.trim();
  if (apiKey) {
    const headerKey = request.headers.get('x-api-key')?.trim();
    if (headerKey && headerKey === apiKey) return true;
  }
  // Session prüfen
  try {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
    return role === 'admin';
  } catch {
    return false;
  }
}

export function rateLimit(request: Request, key: string): boolean {
  const points = Math.max(1, parseInt(process.env.ADMIN_RATE_LIMIT_POINTS || '60', 10));
  const windowMs = Math.max(1000, parseInt(process.env.ADMIN_RATE_LIMIT_WINDOW_MS || '60000', 10));
  const ip = getClientIp(request);
  const map = (global.__rateLimits ||= new Map<string, RateBucket>());
  const bucketKey = `${key}:${ip}`;
  const now = Date.now();
  const refillRate = points / windowMs; // tokens per ms
  const b = map.get(bucketKey) || { tokens: points, lastRefill: now };
  // refill
  const elapsed = now - b.lastRefill;
  if (elapsed > 0) {
    b.tokens = Math.min(points, b.tokens + elapsed * refillRate);
    b.lastRefill = now;
  }
  if (b.tokens >= 1) {
    b.tokens -= 1;
    map.set(bucketKey, b);
    return true;
  }
  map.set(bucketKey, b);
  return false;
}
