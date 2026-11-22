/** Stream accounts: hard cap of 5, private access codes, signed sessions, IP rate limiting. */

import { createHash } from "node:crypto";
import type { StreamAccount } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/http";
import { readCookie, SESSION_TTL_SECONDS, signSession, STREAM_COOKIE, verifySession } from "./session";

export const MAX_STREAMS = 5;
export const RATE_LIMIT_MAX_FAILURES = 10;
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export function allowedStreamCodes(): string[] {
  return getEnv().ALLOWED_STREAM_CODES.slice(0, MAX_STREAMS);
}

export function sessionSecret(): string {
  const s = getEnv().SESSION_SECRET;
  if (!s) throw new AppError(503, "SESSION_NOT_CONFIGURED", "SESSION_SECRET (≥ 32 chars) is not configured on the server.");
  return s;
}

function hashIp(ip: string): string {
  return createHash("sha256").update(`lexiforge-ip:${ip}`).digest("hex").slice(0, 32);
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim() || "unknown";
}

/**
 * Resolves the authenticated stream for a request or throws 401.
 * Every isolated query in the app is scoped by the id returned here.
 */
export async function requireStream(req: Request, now = new Date()): Promise<StreamAccount> {
  const secret = sessionSecret();
  const payload = await verifySession(readCookie(req.headers.get("cookie"), STREAM_COOKIE), secret, now.getTime());
  if (!payload) throw new AppError(401, "UNAUTHENTICATED", "Enter your stream access code.");
  if (!allowedStreamCodes().includes(payload.code)) throw new AppError(401, "STREAM_REVOKED", "This access code is no longer allowed.");
  const stream = await prisma.streamAccount.findUnique({ where: { id: payload.sid } });
  if (!stream || stream.code !== payload.code) throw new AppError(401, "UNAUTHENTICATED", "Stream session is invalid. Enter your access code again.");
  if (now.getTime() - stream.lastActiveAt.getTime() > TOUCH_INTERVAL_MS) {
    await prisma.streamAccount.update({ where: { id: stream.id }, data: { lastActiveAt: now } });
  }
  return stream;
}

export interface EnterResult {
  stream: StreamAccount;
  token: string;
}

/** Validates an access code (rate-limited per IP) and lazily creates its stream, never beyond MAX_STREAMS. */
export async function enterStream(rawCode: string, ip: string, now = new Date()): Promise<EnterResult> {
  const secret = sessionSecret();
  const ipHash = hashIp(ip);
  const since = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);
  const failures = await prisma.accessFailure.count({ where: { ipHash, createdAt: { gte: since } } });
  if (failures >= RATE_LIMIT_MAX_FAILURES) {
    throw new AppError(429, "RATE_LIMITED", "Too many failed attempts. Try again in 15 minutes.");
  }
  const code = rawCode.trim();
  if (!allowedStreamCodes().includes(code)) {
    await prisma.accessFailure.create({ data: { ipHash, createdAt: now } });
    const left = Math.max(0, RATE_LIMIT_MAX_FAILURES - failures - 1);
    throw new AppError(403, "INVALID_CODE", left > 0 ? `That access code is not valid. ${left} attempt${left === 1 ? "" : "s"} left.` : "That access code is not valid. Try again in 15 minutes.");
  }
  let stream = await prisma.streamAccount.findUnique({ where: { code } });
  if (!stream) {
    const count = await prisma.streamAccount.count();
    if (count >= MAX_STREAMS) throw new AppError(403, "STREAM_CAP", `This deployment is limited to ${MAX_STREAMS} streams.`);
    stream = await prisma.streamAccount.upsert({
      where: { code },
      update: {},
      create: { code, label: `Stream ${code}`, createdAt: now, lastActiveAt: now, settings: { create: {} }, progress: { create: {} } },
    });
  }
  stream = await prisma.streamAccount.update({ where: { id: stream.id }, data: { lastActiveAt: now } });
  const token = await signSession({ sid: stream.id, code: stream.code, exp: Math.floor(now.getTime() / 1000) + SESSION_TTL_SECONDS }, secret);
  return { stream, token };
}

export function isSecureRequest(req: Request): boolean {
  return process.env.NODE_ENV === "production" || req.url.startsWith("https://");
}
