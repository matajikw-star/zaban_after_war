/// <reference path="../../pb_data/types.d.ts" />

// Accounts are keyed by phone (what.md §8.1). Two routes create one on first sight of a phone:
// `POST /api/otp/verify` (a first login) and `POST /api/admin/grant` (the owner granting access to
// someone who has not signed in yet).

/**
 * Find or create the user for an E.164 phone. The unique index on `phone` settles a race between
 * two first sightings: the loser's save fails and it finds the winner's record.
 *
 * @param {core.App} app
 * @param {string} phone E.164, already normalised
 * @returns {{user: core.Record, created: boolean}}
 */
function findOrCreateByPhone(app, phone) {
  try {
    return { user: app.findFirstRecordByData('users', 'phone', phone), created: false };
  } catch (_err) {
    // not found: create below
  }

  const created = new Record(app.findCollectionByNameOrId('users'));
  created.set('phone', phone);
  // An auth record must have a password; password auth is disabled, so nobody can use it.
  created.setPassword($security.randomString(40));
  try {
    app.save(created);
    return { user: created, created: true };
  } catch (err) {
    try {
      return { user: app.findFirstRecordByData('users', 'phone', phone), created: false };
    } catch (_err) {
      throw err;
    }
  }
}

module.exports = { findOrCreateByPhone };
