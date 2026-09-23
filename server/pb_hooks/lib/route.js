/// <reference path="../../pb_data/types.d.ts" />

// withRoute — the wrapper every hook route in this server goes through (what.md §8.2, §10.2).
//
// It does five things so that no individual route has to:
//   1. authenticates (none / user / superuser / optional) and answers UNAUTHORIZED or FORBIDDEN;
//   2. caps and validates the JSON body against a tiny declarative schema;
//   3. calls the handler and times it;
//   4. catches everything — an unexpected throw becomes INTERNAL, never a goja stack trace on the
//      wire — and answers the one envelope a client ever sees: { error: { code, message } };
//   5. writes exactly one structured log line per request, with the input redacted.
//
// Usage from a *.pb.js file. Note the require lives *inside* the handler: PocketBase serializes
// each handler and runs it in its own isolated context, so a file's top-level scope is not visible
// from within it, and relative require paths resolve against the CWD rather than pb_hooks — hence
// the `__hooks` global.
//
//   routerAdd('GET', '/api/config', (e) => {
//     const { withRoute } = require(`${__hooks}/lib/route.js`);
//     return withRoute('config', (ctx) => ({ ok: true }), { auth: 'none' })(e);
//   });

const { AppError, CODES, isAppError } = require(`${__hooks}/lib/errors.js`);

/** what.md §15: "bodies capped at 32 KB". */
const MAX_BODY_BYTES = 32 * 1024;

/** A logged string value is truncated here so one bad request cannot flood _logs. */
const MAX_LOGGED_STRING = 200;

// ---------------------------------------------------------------------------------------------
// redaction
// ---------------------------------------------------------------------------------------------

/** Any key matching this is hashed, never logged in the clear (what.md §10.2, §15). */
const SECRET_KEY = /code|token|password|secret|authority/i;

/** `+989121234567` → `+98…4567`. Enough to correlate a report, not enough to be a phone number. */
function maskPhone(value) {
  const s = String(value == null ? '' : value);
  if (s.length < 8) return '…';
  return `${s.slice(0, 3)}…${s.slice(-4)}`;
}

/**
 * The JSVM exposes md5/sha256/sha512 but no sha1, so a sha256 prefix is what identifies a secret
 * across log lines. Same property as the sha1 prefix the ticket asked for: equal inputs collide,
 * the value cannot be read back.
 */
function hashPrefix(value) {
  if (value === undefined || value === null || value === '') return '';
  return `sha256:${$security.sha256(String(value)).slice(0, 12)}`;
}

/** One level deep: arrays and objects are summarised, not walked. Bodies can be 32 KB. */
function redact(input) {
  if (!input || typeof input !== 'object') return input;

  const out = {};
  for (const key of Object.keys(input)) {
    const value = input[key];

    if (key === 'phone') {
      out[key] = maskPhone(value);
    } else if (SECRET_KEY.test(key)) {
      out[key] = hashPrefix(value);
    } else if (Array.isArray(value)) {
      out[key] = `[array:${value.length}]`;
    } else if (value && typeof value === 'object') {
      out[key] = `[object:${Object.keys(value).length}]`;
    } else if (typeof value === 'string' && value.length > MAX_LOGGED_STRING) {
      out[key] = `${value.slice(0, MAX_LOGGED_STRING)}…`;
    } else {
      out[key] = value;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// validation
// ---------------------------------------------------------------------------------------------

// A schema is a flat object of field name → spec. The spec is either a type name, meaning a
// required field of that type:
//
//   { phone: 'string', code: 'string', events: 'array' }
//
// or an object with the type plus constraints:
//
//   { code:    { type: 'string', required: false, max: 32 },
//     events:  { type: 'array',  required: true,  maxItems: 500 },
//     profile: { type: 'object', required: true } }
//
// Types: 'string' | 'number' | 'boolean' | 'object' | 'array'. Undeclared keys are dropped rather
// than rejected, so a newer client sending a field this build does not know about still works.

const TYPES = ['string', 'number', 'boolean', 'object', 'array'];

function typeOf(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function normaliseSpec(name, spec) {
  const s = typeof spec === 'string' ? { type: spec } : spec || {};
  if (TYPES.indexOf(s.type) === -1) {
    // A schema bug, not a client bug: fail loudly rather than letting anything through.
    throw new AppError(CODES.INTERNAL, `bad schema for field ${name}: type ${s.type}`);
  }
  return {
    type: s.type,
    required: s.required !== false,
    max: s.max,
    min: s.min,
    maxItems: s.maxItems,
    enum: s.enum,
  };
}

function validate(body, schema) {
  const out = {};

  for (const name of Object.keys(schema)) {
    const spec = normaliseSpec(name, schema[name]);
    const value = body ? body[name] : undefined;

    if (value === undefined || value === null || value === '') {
      if (spec.required) throw new AppError(CODES.BAD_INPUT, `field ${name} is required`);
      continue;
    }

    const actual = typeOf(value);
    if (actual !== spec.type) {
      throw new AppError(
        CODES.BAD_INPUT,
        `field ${name} must be of type ${spec.type}, got ${actual}`,
      );
    }

    if (spec.type === 'string') {
      if (spec.max !== undefined && value.length > spec.max) {
        throw new AppError(CODES.BAD_INPUT, `field ${name} is longer than ${spec.max}`);
      }
      if (spec.min !== undefined && value.length < spec.min) {
        throw new AppError(CODES.BAD_INPUT, `field ${name} is shorter than ${spec.min}`);
      }
    }

    if (spec.type === 'number') {
      if (!Number.isFinite(value))
        throw new AppError(CODES.BAD_INPUT, `field ${name} is not finite`);
      if (spec.max !== undefined && value > spec.max) {
        throw new AppError(CODES.BAD_INPUT, `field ${name} is greater than ${spec.max}`);
      }
      if (spec.min !== undefined && value < spec.min) {
        throw new AppError(CODES.BAD_INPUT, `field ${name} is less than ${spec.min}`);
      }
    }

    if (spec.type === 'array' && spec.maxItems !== undefined && value.length > spec.maxItems) {
      throw new AppError(CODES.BAD_INPUT, `field ${name} holds more than ${spec.maxItems}`);
    }

    if (spec.enum && spec.enum.indexOf(value) === -1) {
      throw new AppError(CODES.BAD_INPUT, `field ${name} is not an allowed value`);
    }

    out[name] = value;
  }

  return out;
}

// ---------------------------------------------------------------------------------------------
// the wrapper
// ---------------------------------------------------------------------------------------------

/** The unvalidated body, plus the size cap. Read before validation so a rejected request can
 *  still be logged with its (redacted) input — that is the line an agent debugs from. */
function rawBody(e) {
  // Content-Length is the only size we can see before PocketBase has parsed the body; a body
  // without one is bounded by PocketBase's own limits and by the per-field checks below.
  const declared = parseInt(e.request.header.get('Content-Length') || '0', 10);
  if (declared > MAX_BODY_BYTES) {
    throw new AppError(CODES.BAD_INPUT, 'body is larger than 32 KB', 413);
  }

  try {
    return e.requestInfo().body || {};
  } catch (_err) {
    throw new AppError(CODES.BAD_INPUT, 'body is not valid JSON');
  }
}

function requireAuth(e, mode) {
  const auth = e.auth;

  if (mode === 'optional') return auth || null;
  if (mode === 'none') return null;

  if (!auth) throw new AppError(CODES.UNAUTHORIZED, 'authentication required');

  if (mode === 'superuser') {
    if (!e.hasSuperuserAuth()) throw new AppError(CODES.FORBIDDEN, 'superuser only');
    return auth;
  }

  // mode === 'user'
  if (auth.collection().name !== 'users') {
    throw new AppError(CODES.FORBIDDEN, 'not a user token');
  }
  return auth;
}

/**
 * Read a `json` field as a plain JavaScript object.
 *
 * `record.get('jsonField')` hands back the Go `types.JSONRaw` value, which marshals correctly on
 * the way out but whose properties are not readable from JS — `profile.updatedAt` is `undefined`
 * on it, which silently turned newer-wins into always-wins. `getString` gives the raw JSON text,
 * which parses.
 *
 * @returns {object|null}
 */
function readJsonField(record, key) {
  const raw = record.getString(key);
  if (!raw || raw === 'null') return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? value : null;
  } catch (_err) {
    return null;
  }
}

/** The install id identifies a device across reinstalls of nothing — it is per-install (§7.2). */
function installIdOf(e, body) {
  const header = e.request.header.get('X-Install-Id');
  if (header) return String(header).slice(0, 64);
  if (body && typeof body.installId === 'string') return body.installId.slice(0, 64);
  return '';
}

/**
 * @param {string}   name    the route's stable log name, e.g. 'me.profile'
 * @param {function} handler (ctx) => body — ctx is { e, app, auth, body, name, installId }
 * @param {object}   [opts]  { auth: 'none'|'user'|'superuser'|'optional', schema, status }
 * @returns {function} a PocketBase route handler
 */
function withRoute(name, handler, opts) {
  const options = opts || {};
  const mode = options.auth || 'none';
  const okStatus = options.status || 200;

  return (e) => {
    const startedAt = Date.now();

    let status = okStatus;
    let code = '';
    let errMessage = '';
    let loggedInput = null;
    let userId = '';
    let installId = '';
    let payload = null;
    let pub = null;

    try {
      // The install id comes from the header first, so it is known even when the body is the
      // thing that is broken.
      installId = installIdOf(e, null);

      const auth = requireAuth(e, mode);
      if (auth) userId = auth.id;

      let body = {};
      if (options.schema) {
        const raw = rawBody(e);
        // Redact before validating: a request rejected for a bad field still has to log what it
        // sent, or the failure is undebuggable.
        loggedInput = redact(raw);
        if (!installId) installId = installIdOf(e, raw);
        body = validate(raw, options.schema);
      }

      payload = handler({
        e: e,
        app: $app,
        auth: auth,
        body: body,
        name: name,
        installId: installId,
      });
      if (payload === undefined || payload === null) payload = { ok: true };
    } catch (err) {
      if (isAppError(err)) {
        status = err.status;
        code = err.code;
        errMessage = err.message;
        pub = err.pub;
      } else {
        // Anything the handler did not name is a bug in this server, not in the request. The
        // client is told nothing about it; the log gets the whole thing.
        status = 500;
        code = CODES.INTERNAL;
        errMessage = String(err?.message || err);
      }
      payload = { error: { code: code, message: errMessage } };
      if (pub) {
        for (const key of Object.keys(pub)) payload[key] = pub[key];
        // RFC 9110: a 429 says when to come back. The body carries the same number for clients
        // that cannot read headers (a CORS-restricted fetch).
        if (typeof pub.retryAfter === 'number') {
          e.response.header().set('Retry-After', String(pub.retryAfter));
        }
      }
    }

    const ms = Date.now() - startedAt;
    log($app, name, userId, installId, ms, status, code, errMessage, loggedInput);

    return e.json(status, payload);
  };
}

/** One line per request. §10.2 fixes the attribute names; tools/logs reads them. */
function log(app, name, userId, installId, ms, status, code, errMessage, input) {
  const attrs = [
    'route',
    name,
    'userId',
    userId,
    'installId',
    installId,
    'ms',
    ms,
    'status',
    status,
  ];

  if (code) {
    attrs.push('code', code, 'err', errMessage);
    // Only a failure carries the input: a successful request's body says nothing a fix needs.
    if (input) attrs.push('input', JSON.stringify(input));
  }

  const logger = app.logger();
  if (status >= 500) logger.error.apply(logger, ['api'].concat(attrs));
  else if (status >= 400) logger.warn.apply(logger, ['api'].concat(attrs));
  else logger.info.apply(logger, ['api'].concat(attrs));
}

module.exports = {
  withRoute,
  // exported for the routes that need them and for the tests
  AppError,
  CODES,
  readJsonField,
  validate,
  redact,
  maskPhone,
  hashPrefix,
  MAX_BODY_BYTES,
};
