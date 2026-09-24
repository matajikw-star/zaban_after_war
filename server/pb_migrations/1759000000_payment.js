/// <reference path="../pb_data/types.d.ts" />

// Payment and paid content (what.md §8.1–§8.3; ticket dev-payment/01). What the routes needed that
// the initial schema did not have:
//
// payments
//   + failReason (text) — why a payment failed (`cancelled`, `amount_mismatch`, `not_paid`), so
//     `GET /api/pay/status/:id` and the owner in the admin UI read it without parsing `raw`.
//   + expiresAt (date)  — when a still-pending payment is marked `expired` by the cron. Stored
//     rather than derived from `created`, because an autodate cannot be set by a test and the
//     cutoff should be visible on the row.
//   authority index becomes UNIQUE where non-empty: the callback finds its payment by authority,
//     and two rows answering to one authority would make "which one did the user pay" a guess.
//
// entitlements
//   + source value `discount` — a 100 % code grants without the gateway; it is neither a Zarinpal
//     payment nor an owner's manual grant, and the owner's numbers should be able to tell.
//   UNIQUE (user, product) — one entitlement per user and product, enforced by the database. This
//     is the last line of callback idempotency: however a replay or a race slips past the hooks'
//     checks, a second `full` row for the same user cannot be written.
//
// content_downloads (new) — one row per `GET /api/content/paid` served, so the 20-per-user-per-
//   day cap is an in-hook count (the way OTP and telemetry count), and the owner has evidence if a
//   paid account is ever used to redistribute the file (ADR-0004: "the owner acting on evidence").

migrate(
  (app) => {
    // --- payments -------------------------------------------------------------------------
    const payments = app.findCollectionByNameOrId('payments');
    payments.fields.add(new TextField({ name: 'failReason', max: 64 }));
    payments.fields.add(new DateField({ name: 'expiresAt' }));
    payments.indexes = [
      'CREATE INDEX `idx_payments_user` ON `payments` (`user`)',
      "CREATE UNIQUE INDEX `idx_payments_authority` ON `payments` (`authority`) WHERE `authority` != ''",
      'CREATE INDEX `idx_payments_status` ON `payments` (`status`)',
    ];
    app.save(payments);

    // --- entitlements ---------------------------------------------------------------------
    const entitlements = app.findCollectionByNameOrId('entitlements');
    const source = entitlements.fields.getByName('source');
    source.values = ['zarinpal', 'manual', 'bazaar', 'discount'];
    entitlements.indexes = [
      'CREATE INDEX `idx_entitlements_user` ON `entitlements` (`user`)',
      'CREATE UNIQUE INDEX `idx_entitlements_user_product` ON `entitlements` (`user`, `product`)',
    ];
    app.save(entitlements);

    // --- content_downloads ----------------------------------------------------------------
    const usersId = app.findCollectionByNameOrId('users').id;
    const downloads = new Collection({
      type: 'base',
      name: 'content_downloads',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'user',
          type: 'relation',
          required: true,
          maxSelect: 1,
          collectionId: usersId,
          cascadeDelete: true,
        },
        { name: 'packageId', type: 'text', max: 16 },
        { name: 'version', type: 'text', max: 32 },
        { name: 'range', type: 'text', max: 64 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      indexes: [
        'CREATE INDEX `idx_content_downloads_user_created` ON `content_downloads` (`user`, `created`)',
      ],
    });
    app.save(downloads);
  },

  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('content_downloads'));
    } catch {
      // Already gone.
    }

    try {
      const entitlements = app.findCollectionByNameOrId('entitlements');
      entitlements.fields.getByName('source').values = ['zarinpal', 'manual', 'bazaar'];
      entitlements.indexes = ['CREATE INDEX `idx_entitlements_user` ON `entitlements` (`user`)'];
      app.save(entitlements);
    } catch {
      // Nothing to revert.
    }

    try {
      const payments = app.findCollectionByNameOrId('payments');
      payments.fields.removeByName('failReason');
      payments.fields.removeByName('expiresAt');
      payments.indexes = [
        'CREATE INDEX `idx_payments_user` ON `payments` (`user`)',
        'CREATE INDEX `idx_payments_authority` ON `payments` (`authority`)',
        'CREATE INDEX `idx_payments_status` ON `payments` (`status`)',
      ];
      app.save(payments);
    } catch {
      // Nothing to revert.
    }
  },
);
