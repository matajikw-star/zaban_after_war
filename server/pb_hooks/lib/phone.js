/// <reference path="../../pb_data/types.d.ts" />

// Iranian mobile numbers → E.164 (what.md §8.1: `users.phone` is E.164, unique).
//
// Accepted, after Persian/Arabic-Indic digits are turned into ASCII and spaces/hyphens removed:
//   09121234567      → +989121234567   (how Iranians write it)
//   9121234567       → +989121234567   (the leading zero dropped)
//   +989121234567    → +989121234567
//   00989121234567   → +989121234567
// Everything else — landlines, foreign numbers, 98912… without a `+` or `00`, a wrong length —
// is refused. The product only ever sends SMS to Iranian mobiles, so a wider rule would only admit
// numbers the SMS provider then fails on.

/** U+06F0..U+06F9 (Persian) and U+0660..U+0669 (Arabic-Indic) → '0'..'9'. */
function asciiDigits(value) {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0x06f0 && c <= 0x06f9) out += String.fromCharCode(48 + c - 0x06f0);
    else if (c >= 0x0660 && c <= 0x0669) out += String.fromCharCode(48 + c - 0x0660);
    else out += value.charAt(i);
  }
  return out;
}

/**
 * @param {unknown} input
 * @returns {string|null} `+989XXXXXXXXX`, or null when the input is not an Iranian mobile
 */
function normalizeIranMobile(input) {
  if (typeof input !== 'string') return null;
  const s = asciiDigits(input).replace(/[\s-]/g, '');

  if (/^\+989\d{9}$/.test(s)) return s;
  if (/^00989\d{9}$/.test(s)) return `+${s.slice(2)}`;
  if (/^09\d{9}$/.test(s)) return `+98${s.slice(1)}`;
  if (/^9\d{9}$/.test(s)) return `+98${s}`;
  return null;
}

/** `+989121234567` → `09121234567`: the form the Iranian SMS gateway expects as a receptor. */
function toLocal(e164) {
  return `0${e164.slice(3)}`;
}

module.exports = { normalizeIranMobile, asciiDigits, toLocal };
