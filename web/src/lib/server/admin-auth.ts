import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "./env";

// 后台登录：只用一个管理员密码（ADMIN_PASSWORD），登录后发一个签名 Cookie，7 天有效
const COOKIE = "campus_admin";
const MAX_AGE = 7 * 24 * 3600;

const sha256 = (value: string) => createHash("sha256").update(value).digest();

function signingKey(): Buffer | null {
  return env.adminPassword ? sha256(`campus-agent-session:${env.adminPassword}`) : null;
}

function sign(payload: string, key: Buffer): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function adminEnabled(): boolean {
  return Boolean(env.adminPassword);
}

export function checkPassword(input: string): boolean {
  if (!env.adminPassword) return false;
  return timingSafeEqual(sha256(input), sha256(env.adminPassword));
}

function verifyToken(token: string | undefined): boolean {
  const key = signingKey();
  if (!key || !token) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature || Number(expires) < Date.now() / 1000) return false;
  const expected = Buffer.from(sign(expires, key));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function isAdmin(): Promise<boolean> {
  return verifyToken((await cookies()).get(COOKIE)?.value);
}

export async function startAdminSession() {
  const key = signingKey();
  if (!key) throw new Error("后台未启用");
  const expires = String(Math.floor(Date.now() / 1000) + MAX_AGE);
  (await cookies()).set(COOKIE, `${expires}.${sign(expires, key)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endAdminSession() {
  (await cookies()).delete(COOKIE);
}
