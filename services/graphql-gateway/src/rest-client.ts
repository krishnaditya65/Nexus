// GraphQL API gateway (docs/FEATURES.md §11.9) — every resolver in this
// service is a real REST call to an existing service, forwarding the
// CALLER's own bearer token, never a gateway-held credential. Each
// downstream service still independently authenticates/authorizes the
// request exactly as it would for a direct REST call — this gateway
// adds no new trust boundary, it just lets a client compose one GraphQL
// query instead of orchestrating N REST calls itself.
export class RestError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'RestError';
  }
}

export async function restGet<T>(baseUrl: string, path: string, authorization: string): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, { headers: { authorization } });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new RestError(res.status, body.message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function restPost<T>(baseUrl: string, path: string, authorization: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { message?: string };
    throw new RestError(res.status, errBody.message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}
