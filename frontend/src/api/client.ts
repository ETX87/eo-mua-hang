export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`API ${status}`);
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });
  if (res.status === 401) {
    window.location.href = "/api/auth/login";
    throw new ApiError(401, null);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export const api = {
  get: <T>(p: string) => req<T>("GET", p),
  post: <T>(p: string, b?: unknown) => req<T>("POST", p, b),
  patch: <T>(p: string, b?: unknown) => req<T>("PATCH", p, b),
  put: <T>(p: string, b?: unknown) => req<T>("PUT", p, b),
  del: <T>(p: string, b?: unknown) => req<T>("DELETE", p, b),
};
