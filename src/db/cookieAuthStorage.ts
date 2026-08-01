// Shared cookie-backed storage adapter so the Supabase session survives across
// every *.sachinnandal.me subdomain (index, training, cashflow, tools), not
// just the origin that signed in. Mirrors the localStorage Storage interface
// Supabase's client expects, but reads/writes a cookie scoped to the parent
// domain instead. Kept identical to tools-hub's and index's copy.

const COOKIE_DOMAIN = (import.meta.env.VITE_AUTH_COOKIE_DOMAIN as string) || '.sachinnandal.me';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function isLocalDev(): boolean {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string) {
  const domainAttr = isLocalDev() ? '' : `; domain=${COOKIE_DOMAIN}`;
  document.cookie =
    `${name}=${encodeURIComponent(value)}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax; secure${domainAttr}`;
}

function deleteCookie(name: string) {
  const domainAttr = isLocalDev() ? '' : `; domain=${COOKIE_DOMAIN}`;
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax; secure${domainAttr}`;
}

export const cookieAuthStorage = {
  getItem: (key: string) => readCookie(key),
  setItem: (key: string, value: string) => writeCookie(key, value),
  removeItem: (key: string) => deleteCookie(key),
};
