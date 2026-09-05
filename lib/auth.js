import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "llp_admin";
const SESSION_LENGTH_SECONDS = 60 * 60 * 12;

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

function signature(value) {
  return createHmac("sha256", process.env.SESSION_SECRET || "")
    .update(value)
    .digest("base64url");
}

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map((part) => {
    const index = part.indexOf("=");
    if (index < 0) return ["", ""];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
  }).filter(([key]) => key));
}

export function credentialsConfigured() {
  return Boolean(
    process.env.ADMIN_PASSWORD &&
    process.env.SESSION_SECRET &&
    process.env.SESSION_SECRET.length >= 32
  );
}

export function passwordMatches(candidate) {
  return credentialsConfigured() && safeEqual(candidate || "", process.env.ADMIN_PASSWORD);
}

export function issueAdminCookie(res) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_LENGTH_SECONDS;
  const value = `${expires}.${signature(String(expires))}`;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_LENGTH_SECONDS}${secure}`);
}

export function clearAdminCookie(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}

export function isAdmin(req) {
  if (!credentialsConfigured()) return false;
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!token) return false;
  const [expiresRaw, receivedSignature] = token.split(".");
  const expires = Number(expiresRaw);
  return Number.isInteger(expires) &&
    expires > Math.floor(Date.now() / 1000) &&
    safeEqual(receivedSignature || "", signature(expiresRaw));
}

export function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ error: "Please sign in to continue." });
  next();
}
