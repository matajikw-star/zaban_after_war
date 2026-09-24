// A thin PocketBase superuser client for the log-reading tools (`tools/errors`, `tools/logs`,
// `tools/flags`; what.md §10.3). Not `net/pocketbase.ts` (that deliberately does not exist,
// ticket 01) — this is an operator's CLI talking to the generic collection API as a superuser,
// which the app itself never does.

export interface PbListPage<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly perPage: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export interface PbClient {
  readonly origin: string;
  readonly token: string;
  list<T = Record<string, unknown>>(
    collection: string,
    params?: Record<string, string>,
  ): Promise<PbListPage<T>>;
  /** Pages through every matching record. Use a `filter` — an unfiltered listAll can be huge. */
  listAll<T = Record<string, unknown>>(
    collection: string,
    params?: Record<string, string>,
  ): Promise<T[]>;
  /** Raw bytes from an authenticated GET — the sourcemap route. Throws with the status on failure. */
  getBinary(pathAndQuery: string): Promise<Uint8Array>;
  /** Parsed JSON from an authenticated GET against any path — `/api/logs`, which is not under
   *  `/api/collections/*` the way every other collection here is. */
  getJson<T = unknown>(pathAndQuery: string): Promise<T>;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    if (body.error?.message) return body.error.message;
  } catch {
    // fall through
  }
  return response.statusText;
}

export async function loginSuperuser(
  origin: string,
  email: string,
  password: string,
): Promise<PbClient> {
  const response = await fetch(`${origin}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identity: email, password }),
  });
  if (!response.ok) {
    throw new Error(
      `could not log in as superuser at ${origin}: ${response.status} ${await readError(response)}`,
    );
  }
  const body = (await response.json()) as { token: string };
  const token = body.token;

  async function list<T>(
    collection: string,
    params: Record<string, string> = {},
  ): Promise<PbListPage<T>> {
    const search = new URLSearchParams(params);
    const response = await fetch(
      `${origin}/api/collections/${collection}/records?${search.toString()}`,
      {
        headers: { Authorization: token },
      },
    );
    if (!response.ok) {
      throw new Error(`GET ${collection}: ${response.status} ${await readError(response)}`);
    }
    return (await response.json()) as PbListPage<T>;
  }

  async function listAll<T>(collection: string, params: Record<string, string> = {}): Promise<T[]> {
    const perPage = 200;
    const out: T[] = [];
    for (let page = 1; ; page++) {
      const found = await list<T>(collection, {
        ...params,
        page: String(page),
        perPage: String(perPage),
      });
      out.push(...found.items);
      if (found.items.length < perPage || page >= found.totalPages) break;
    }
    return out;
  }

  async function getBinary(pathAndQuery: string): Promise<Uint8Array> {
    const response = await fetch(`${origin}${pathAndQuery}`, { headers: { Authorization: token } });
    if (!response.ok) {
      throw new Error(`GET ${pathAndQuery}: ${response.status} ${await readError(response)}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  async function getJson<T>(pathAndQuery: string): Promise<T> {
    const response = await fetch(`${origin}${pathAndQuery}`, { headers: { Authorization: token } });
    if (!response.ok) {
      throw new Error(`GET ${pathAndQuery}: ${response.status} ${await readError(response)}`);
    }
    return (await response.json()) as T;
  }

  return { origin, token, list, listAll, getBinary, getJson };
}
