export const json = (body: unknown, status = 200) => Response.json(body, { status });
export const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

export const HANDLE_RE = /^[a-z0-9_-]{2,32}$/;
export const SLUG_RE = /^[a-z0-9-]{1,48}$/;
