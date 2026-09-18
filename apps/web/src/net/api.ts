/**
 * Every network call the app makes (`what.md` §8.2, §17.8).
 *
 * The server does not exist yet — these types *are* the contract, and `pb_hooks/` is written
 * against them in Phase 4. One `request()` underneath them all attaches the bearer token, logs a
 * `net` breadcrumb and maps every failure to an `AppError` code, so no caller anywhere has to
 * look at a `Response`.
 *
 * `net/pocketbase.ts` does not exist by decision (ticket 01): the app talks to our own routes,
 * never to PocketBase's generic collection API.
 */

import type { ReviewEvent } from '@kl/core';
import type { ContentManifest } from '../content/types.ts';
import { now } from '../engine/clock.ts';
import { AppError } from '../errors.ts';
import { breadcrumb } from '../log/breadcrumbs.ts';
import { currentToken } from '../stores/auth.ts';

/** Same origin in production; `VITE_API_ORIGIN` points a dev build at the deployed API (§18). */
const BASE_URL: string = import.meta.env.VITE_API_ORIGIN ?? '';

export type HttpMethod = 'GET' | 'POST' | 'PATCH';

interface RequestOptions {
  readonly method: HttpMethod;
  readonly route: string;
  readonly body?: unknown;
  /** Routes that take no auth still send the token when there is one (`optional` in §8.2). */
  readonly auth?: boolean;
  readonly headers?: Record<string, string>;
  /** `GET /api/content/paid` is streamed, so it wants the `Response`, not parsed JSON. */
  readonly raw?: boolean;
  readonly signal?: AbortSignal;
}

interface ServerErrorBody {
  readonly error?: { readonly code?: string; readonly message?: string };
  readonly retryAfter?: number;
}

function retryAfterOf(response: Response, body: ServerErrorBody | null): number | null {
  const header = response.headers.get('retry-after');
  if (header !== null) {
    const seconds = Number.parseInt(header, 10);
    if (Number.isFinite(seconds)) return seconds;
  }
  return body?.retryAfter ?? null;
}

/**
 * The full mapping, in the order it is applied:
 *
 * - `fetch` rejected (offline, DNS, filtering)  → `NETWORK`
 * - `401`                                       → `UNAUTHORIZED`
 * - `429`                                       → `RATE_LIMITED`, `data.retryAfter` in seconds
 * - a body of `{error:{code}}`                  → `SERVER_<CODE>`
 * - anything else                               → `HTTP_<status>`
 */
async function toError(response: Response, route: string): Promise<AppError> {
  let body: ServerErrorBody | null = null;
  let message = `${response.status} ${response.statusText}`.trim();
  try {
    body = (await response.json()) as ServerErrorBody;
    if (body?.error?.message !== undefined) message = body.error.message;
  } catch {
    // A non-JSON error body (a Caddy 502 page, say) is not itself a problem worth reporting.
  }

  const data = { route, status: response.status };

  if (response.status === 401) return new AppError('UNAUTHORIZED', message, data);
  if (response.status === 429) {
    return new AppError('RATE_LIMITED', message, {
      ...data,
      retryAfter: retryAfterOf(response, body),
    });
  }
  const code = body?.error?.code;
  if (typeof code === 'string' && code.length > 0) {
    return new AppError(`SERVER_${code.toUpperCase()}`, message, data);
  }
  return new AppError(`HTTP_${response.status}`, message, data);
}

async function request<T>(options: RequestOptions): Promise<T> {
  const { method, route, body, auth = true, raw = false } = options;
  const startedAt = now();

  const headers: Record<string, string> = { accept: 'application/json', ...options.headers };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (auth) {
    const token = currentToken();
    if (token !== null) headers.authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${route}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  } catch (err) {
    breadcrumb('net', 'request', { method, route, status: 0, ms: now() - startedAt });
    throw new AppError('NETWORK', 'the request never reached the server', {
      route,
      cause: String(err),
    });
  }

  breadcrumb('net', 'request', {
    method,
    route,
    status: response.status,
    ms: now() - startedAt,
  });

  if (!response.ok) throw await toError(response, route);
  if (raw) return response as unknown as T;
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------- shapes

export interface AppConfig {
  readonly listPrice: number;
  readonly salePrice: number;
  readonly freePresentationLimit: number;
  readonly minAppVersion: string;
  readonly supportUrl: string;
  readonly notice: string | null;
}

export interface OtpRequestResponse {
  readonly ok: boolean;
  /** Seconds until another code may be asked for. */
  readonly retryAfter: number;
}

export interface AuthUser {
  readonly id: string;
  readonly phone: string;
}

/** The PocketBase auth response `/api/otp/verify` passes through. */
export interface OtpVerifyResponse {
  readonly token: string;
  readonly record: AuthUser;
}

export interface EntitlementResponse {
  readonly status: 'none' | 'full';
  readonly source: string | null;
  readonly grantedAt: number | null;
}

export interface MeResponse {
  readonly user: AuthUser;
  readonly entitlement: EntitlementResponse;
  readonly profileUpdatedAt: number | null;
}

export interface SyncPushResponse {
  readonly accepted: number;
  readonly duplicates: number;
}

export interface SyncPullResponse {
  readonly events: readonly ReviewEvent[];
  readonly cursor: string;
  readonly more: boolean;
}

export type DiscountCodeStatus =
  | 'ok'
  | 'invalid'
  | 'expired'
  | 'exhausted'
  | 'used'
  | 'already-entitled';

export interface PayQuoteResponse {
  readonly listPrice: number;
  readonly salePrice: number;
  readonly discountAmount: number;
  readonly payable: number;
  readonly codeStatus: DiscountCodeStatus;
}

/** A 100 % code grants directly and returns no gateway URL (§8.2). */
export interface PayRequestResponse {
  readonly paymentId: string;
  readonly gatewayUrl?: string;
  readonly granted?: boolean;
}

export interface PayStatusResponse {
  readonly status: 'pending' | 'paid' | 'failed' | 'expired';
  readonly refId: string | null;
}

export interface FlagBody {
  readonly installId: string;
  readonly itemId: string;
  readonly reason: string;
  readonly appVersion: string;
  readonly at: number;
}

/** The fixed list of §8.4. The server rejects an unknown name, so adding one changes both. */
export type BeaconName =
  | 'first_open'
  | 'onboarding_done'
  | 'first_review'
  | 'reviews_10'
  | 'reviews_100'
  | 'paywall_shown'
  | 'login_done'
  | 'purchase_started'
  | 'purchase_done'
  | 'download_done'
  | 'install_prompt_shown'
  | 'install_prompt_accepted'
  | 'season_shown';

export interface BeaconEvent {
  readonly name: BeaconName;
  readonly at: number;
  readonly appVersion: string;
}

export interface BeaconBody {
  readonly installId: string;
  readonly events: readonly BeaconEvent[];
}

export interface OkResponse {
  readonly ok: boolean;
}

export interface ClientErrorsResponse {
  readonly ok: boolean;
  readonly deduped: boolean;
}

export interface HealthResponse {
  readonly ok: boolean;
  readonly version: string;
  readonly time: number;
}

export interface ProfileBody {
  readonly profile: unknown;
}

// ---------------------------------------------------------------------------- routes

export function appConfig(): Promise<AppConfig> {
  return request({ method: 'GET', route: '/api/config', auth: false });
}

export function otpRequest(phone: string): Promise<OtpRequestResponse> {
  return request({ method: 'POST', route: '/api/otp/request', body: { phone }, auth: false });
}

export function otpVerify(phone: string, code: string): Promise<OtpVerifyResponse> {
  return request({ method: 'POST', route: '/api/otp/verify', body: { phone, code }, auth: false });
}

export function me(): Promise<MeResponse> {
  return request({ method: 'GET', route: '/api/me' });
}

export function patchProfile(profile: unknown): Promise<OkResponse> {
  return request({
    method: 'PATCH',
    route: '/api/me/profile',
    body: { profile } satisfies ProfileBody,
  });
}

/** Batches of at most 500 (§7.4); the server insert-ignores by id, so a resend is free. */
export function syncPush(events: readonly ReviewEvent[]): Promise<SyncPushResponse> {
  return request({ method: 'POST', route: '/api/sync/push', body: { events } });
}

export function syncPull(since: string | null, limit: number): Promise<SyncPullResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (since !== null) params.set('since', since);
  return request({ method: 'GET', route: `/api/sync/pull?${params.toString()}` });
}

export function contentManifest(): Promise<ContentManifest> {
  return request({ method: 'GET', route: '/api/content/manifest', auth: false });
}

/**
 * The raw `Response`, because §7.5 streams this into a buffer and resumes with `Range`. It is the
 * one route that does not hand back parsed JSON.
 */
export function contentPaid(rangeFrom?: number, signal?: AbortSignal): Promise<Response> {
  return request({
    method: 'GET',
    route: '/api/content/paid',
    raw: true,
    ...(rangeFrom === undefined ? {} : { headers: { range: `bytes=${rangeFrom}-` } }),
    ...(signal === undefined ? {} : { signal }),
  });
}

export function payQuote(code?: string): Promise<PayQuoteResponse> {
  return request({
    method: 'POST',
    route: '/api/pay/quote',
    body: code === undefined ? {} : { code },
  });
}

export function payRequest(code?: string): Promise<PayRequestResponse> {
  return request({
    method: 'POST',
    route: '/api/pay/request',
    body: code === undefined ? {} : { code },
  });
}

export function payStatus(paymentId: string): Promise<PayStatusResponse> {
  return request({ method: 'GET', route: `/api/pay/status/${encodeURIComponent(paymentId)}` });
}

export function postFlags(body: FlagBody): Promise<OkResponse> {
  return request({ method: 'POST', route: '/api/flags', body });
}

export function postBeacon(body: BeaconBody): Promise<OkResponse> {
  return request({ method: 'POST', route: '/api/beacon', body });
}

export function postClientErrors(record: unknown): Promise<ClientErrorsResponse> {
  return request({ method: 'POST', route: '/api/client-errors', body: record });
}

export function health(): Promise<HealthResponse> {
  return request({ method: 'GET', route: '/api/health', auth: false });
}
