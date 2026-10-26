import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const sw = readFileSync(join(root, 'public/sw.js'), 'utf8');
const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};

function cacheControl(source: string) {
  return vercel.headers.find(entry => entry.source === source)?.headers.find(header => header.key === 'Cache-Control')?.value;
}

describe('shell and API caching', () => {
  it('does not intercept Supabase or abort fetches on a short timer', () => {
    expect(sw).not.toContain('gobicwnqqadquxpbdbae');
    expect(sw).not.toContain('SUPABASE_HOST');
    expect(sw).not.toMatch(/\bDATA_CACHE\b/);
    expect(sw).not.toMatch(/NETWORK_TIMEOUT|AbortController|setTimeout\(/);
    expect(sw).toMatch(/API calls \(Supabase included\) stay on the network/);
    expect(sw).toContain("url.pathname.startsWith('/assets/')");
    expect(sw).toContain('shellFirst');
  });

  it('keeps hashed bundles immutable and revalidates the shell', () => {
    expect(cacheControl('/assets/(.*)')).toBe('public, max-age=31536000, immutable');
    expect(cacheControl('/((?!assets/).*)')).toBe('public, max-age=0, must-revalidate');
  });
});
