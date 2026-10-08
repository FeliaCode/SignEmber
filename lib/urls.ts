// EmberSign service URLs (pure, unit-tested).

/** `${appUrl}/x/{handle}/{slug}` -> {handle, slug}; anything else (other origin, other path) -> null. */
export function parseEmberUrl(raw: string, appUrl: string): { handle: string; slug: string } | null {
  let u: URL;
  let app: URL;
  try {
    u = new URL(raw);
    app = new URL(appUrl);
  } catch {
    return null;
  }
  if (u.origin !== app.origin || u.search || u.hash) return null;
  const base = app.pathname.replace(/\/$/, "");
  if (!u.pathname.startsWith(`${base}/x/`)) return null;
  const m = /^\/x\/([a-z0-9_-]{2,32})\/([a-z0-9-]{1,48})\/?$/.exec(u.pathname.slice(base.length));
  return m ? { handle: m[1], slug: m[2] } : null;
}

export const serviceUrl = (appUrl: string, handle: string, slug: string) => `${appUrl.replace(/\/$/, "")}/x/${handle}/${slug}`;
