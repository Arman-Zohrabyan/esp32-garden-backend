import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { timingSafeEqual } from 'crypto';

// Reads are public — the dashboard shows them without any credential. Writes
// need ADMIN_TOKEN in the X-Admin-Token header.
//
// The firmware-facing routes are deliberately exempt (see SKIP_PATHS): the
// board has no way to hold a dashboard secret, and they are the only POSTs it
// makes. They stay open exactly as before this guard existed.
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Matched against the path, which always starts with /devices/by-chip/...
const SKIP_PATHS = [/^\/devices\/by-chip\/[^/]+\/(sync|report|watering)$/];

@Injectable()
export class AdminTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (READ_METHODS.has(req.method)) return true;

    const path = req.path ?? req.url.split('?')[0];
    if (SKIP_PATHS.some((re) => re.test(path))) return true;

    const expected = process.env.ADMIN_TOKEN;
    // No token configured means the deployment hasn't opted into write
    // protection; refusing every write would brick the dashboard instead.
    if (!expected) return true;

    const given = req.header('x-admin-token') ?? '';
    if (!safeEqual(given, expected)) {
      throw new UnauthorizedException('Invalid or missing admin token');
    }
    return true;
  }
}

// Constant-time compare so a wrong token can't be narrowed down by timing.
// Lengths are compared first because timingSafeEqual throws on a mismatch;
// that leaks only the length, which isn't secret.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
