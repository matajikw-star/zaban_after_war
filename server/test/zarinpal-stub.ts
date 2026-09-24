// A local stand-in for Zarinpal REST v4 (lib/zarinpal.js), so no test ever reaches the real
// gateway: the server under test is started with ZARINPAL_API_BASE pointing here. It keeps just
// enough state to answer like Zarinpal does — an authority per request, "paid" once the test says
// the user paid, 100 on the first verify and 101 after, -50 for an amount that differs from what
// was paid, -51 for an authority nobody paid — and it records every call so a test can assert
// what the server sent (amount, currency) and whether it called at all.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface StubCall {
  path: string;
  body: any;
}

export interface StubSession {
  authority: string;
  amount: number;
  currency: string;
  callbackUrl: string;
  metadata: any;
  /** What the user actually paid, once `pay()` has been called; null = never paid. */
  paidAmount: number | null;
  verified: boolean;
  refId: number;
}

export interface ZarinpalStub {
  url: string;
  calls: StubCall[];
  sessions: Map<string, StubSession>;
  /** The user pays `authority` — the requested amount unless `amount` says otherwise. */
  pay(authority: string, amount?: number): void;
  /** The next `request` answers with this Zarinpal error code instead of an authority. */
  failNextRequest: number | null;
  /** While true, `verify` answers HTTP 500 with no JSON: the gateway is down. */
  verifyDown: boolean;
  /** Milliseconds `verify` waits before answering, so concurrent callbacks really overlap. */
  verifyDelayMs: number;
  callsTo(path: string): StubCall[];
  stop(): Promise<void>;
}

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { __unparsed: text };
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function failure(code: number, message: string) {
  return { data: [], errors: { code, message, validations: [] } };
}

export async function startZarinpalStub(): Promise<ZarinpalStub> {
  const sessions = new Map<string, StubSession>();
  const calls: StubCall[] = [];
  let counter = 0;
  let nextRef = 1000;

  const stub: ZarinpalStub = {
    url: '',
    calls,
    sessions,
    failNextRequest: null,
    verifyDown: false,
    verifyDelayMs: 0,
    pay(authority, amount) {
      const session = sessions.get(authority);
      if (!session) throw new Error(`stub: no session ${authority}`);
      session.paidAmount = amount ?? session.amount;
    },
    callsTo(path) {
      return calls.filter((c) => c.path === path);
    },
    async stop() {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    },
  };

  const server = createServer(async (req, res) => {
    const body = await readBody(req);
    const path = (req.url ?? '').split('?')[0] ?? '';
    calls.push({ path, body });

    if (req.method !== 'POST') return send(res, 405, failure(-1, 'method'));

    if (path === '/pg/v4/payment/request.json') {
      if (stub.failNextRequest !== null) {
        const code = stub.failNextRequest;
        stub.failNextRequest = null;
        return send(res, 200, failure(code, 'stubbed failure'));
      }
      counter++;
      // Zarinpal authorities are 36 characters: "A" followed by digits and letters.
      const authority = `A${String(counter).padStart(35, '0')}`;
      sessions.set(authority, {
        authority,
        amount: body.amount,
        currency: body.currency,
        callbackUrl: body.callback_url,
        metadata: body.metadata,
        paidAmount: null,
        verified: false,
        refId: 0,
      });
      return send(res, 200, {
        data: { code: 100, message: 'Success', authority, fee_type: 'Merchant', fee: 100 },
        errors: [],
      });
    }

    if (path === '/pg/v4/payment/verify.json') {
      if (stub.verifyDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, stub.verifyDelayMs));
      }
      if (stub.verifyDown) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        return res.end('upstream down');
      }
      const session = sessions.get(body.authority);
      if (!session) return send(res, 200, failure(-54, 'Invalid authority.'));
      if (session.paidAmount === null) return send(res, 200, failure(-51, 'Session is not valid.'));
      if (body.amount !== session.paidAmount) {
        return send(
          res,
          200,
          failure(-50, 'Session is not valid, amounts values is not the same.'),
        );
      }
      const code = session.verified ? 101 : 100;
      if (!session.verified) {
        session.verified = true;
        session.refId = ++nextRef;
      }
      return send(res, 200, {
        data: {
          code,
          message: code === 100 ? 'Paid' : 'Verified',
          card_hash: 'HASH',
          card_pan: '502229******5995',
          ref_id: session.refId,
          fee_type: 'Merchant',
          fee: 100,
        },
        errors: [],
      });
    }

    if (path === '/pg/v4/payment/unVerified.json') {
      const authorities = [...sessions.values()]
        .filter((s) => s.paidAmount !== null && !s.verified)
        .map((s) => ({
          authority: s.authority,
          amount: s.paidAmount,
          callback_url: s.callbackUrl,
          referer: '',
          date: new Date().toISOString(),
        }));
      return send(res, 200, { data: { code: 100, message: 'Success', authorities }, errors: [] });
    }

    return send(res, 404, failure(-1, 'unknown path'));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  stub.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return stub;
}
