let csrfToken = "";

export function setCsrf(t: string): void {
  csrfToken = t;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

interface ApiOpts {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  raw?: boolean;
}

export async function api<T>(path: string, opts: ApiOpts = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken && opts.method && opts.method !== "GET" ? { "X-CSRF-Token": csrfToken } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401) {
    throw new ApiError(401, "Session expirée, reconnectez-vous");
  }
  if (!res.ok) {
    let msg = "Erreur";
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg);
  }
  if (opts.raw) return res as unknown as T;
  return (await res.json()) as T;
}
