// Shared cookie-backed storage adapter so the Supabase session survives across
// every *.sachinnandal.me subdomain (index, training, cashflow, tools), not
// just the origin that signed in. Mirrors the localStorage Storage interface
// Supabase's client expects, but reads/writes a cookie scoped to the parent
// domain instead.
//
// The value is written in chunks. Browsers cap a single cookie at ~4096 bytes
// and, critically, discard an oversized one *silently* — no error, the write
// just does not happen. A Supabase session is JSON, so URL-encoding roughly
// doubles it once every quote and brace becomes %22/%7B, and it carries the
// access token, the full user record and, after Google OAuth, a provider_token.
// That lands close enough to the cap to look fine in a synthetic test and tip
// over in production. The failure mode is nasty and silent: sign-in succeeds
// server-side and a session row is created, but nothing persists client-side,
// so the app bounces back to the login screen and the user loops forever.
//
// Kept in sync with the copies in the index, performance-os and cashflow apps.

const COOKIE_DOMAIN = (import.meta.env.VITE_AUTH_COOKIE_DOMAIN as string) || '.sachinnandal.me';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

// Leaves room for the cookie name, the attributes and a safety margin.
const MAX_CHUNK = 3000;
// Bounds the probe when clearing; far more chunks than a session can produce.
const MAX_CHUNKS = 20;

function isLocalDev(): boolean {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

// `secure` is omitted on localhost: it is served over http, and a secure cookie
// there is dropped, which would break the whole session in local dev.
function attrs(): string {
  const domainAttr = isLocalDev() ? '' : `; domain=${COOKIE_DOMAIN}`;
  const secureAttr = isLocalDev() ? '' : '; secure';
  return `; path=/; samesite=lax${secureAttr}${domainAttr}`;
}

function readRaw(name: string): string | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/\./g, '\\.') + '=([^;]*)'));
  return match ? match[1] : null;
}

function writeRaw(name: string, encoded: string) {
  document.cookie = `${name}=${encoded}${attrs()}; max-age=${MAX_AGE_SECONDS}`;
}

function deleteRaw(name: string) {
  document.cookie = `${name}=${attrs()}; max-age=0`;
}

function clearChunks(key: string) {
  for (let i = 0; i < MAX_CHUNKS; i++) {
    if (readRaw(`${key}.${i}`) === null) break;
    deleteRaw(`${key}.${i}`);
  }
}

export const cookieAuthStorage = {
  getItem: (key: string): string | null => {
    const single = readRaw(key);
    if (single !== null) return decodeURIComponent(single);

    let joined = '';
    for (let i = 0; i < MAX_CHUNKS; i++) {
      const part = readRaw(`${key}.${i}`);
      if (part === null) break;
      joined += part;
    }
    return joined ? decodeURIComponent(joined) : null;
  },

  setItem: (key: string, value: string) => {
    // Split the *encoded* form so each chunk is independently valid and
    // reassembly is a plain concatenation followed by a single decode.
    const encoded = encodeURIComponent(value);

    if (encoded.length <= MAX_CHUNK) {
      clearChunks(key);
      writeRaw(key, encoded);
      return;
    }

    // Switching to chunks: drop the unchunked copy, so getItem cannot prefer a
    // stale short session over the current one.
    deleteRaw(key);

    const count = Math.ceil(encoded.length / MAX_CHUNK);
    for (let i = 0; i < count; i++) {
      writeRaw(`${key}.${i}`, encoded.slice(i * MAX_CHUNK, (i + 1) * MAX_CHUNK));
    }
    // Drop any chunks left over from a previously longer value.
    for (let i = count; i < MAX_CHUNKS; i++) {
      if (readRaw(`${key}.${i}`) === null) break;
      deleteRaw(`${key}.${i}`);
    }
  },

  removeItem: (key: string) => {
    deleteRaw(key);
    clearChunks(key);
  },
};
