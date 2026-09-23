/// <reference path="../pb_data/types.d.ts" />

// The initial schema: every collection of docs/spec/what.md §8.1 with its API rules.
//
// API rules are the security boundary (§8.1, §15). Two values matter and they are not the same:
//   ""   — anyone, including a guest
//   null — nobody through the REST API; only a hook or a superuser
// Everything a client must not write directly is `null` and is written by a hook with app.save(),
// which bypasses API rules by design.
//
// PocketBase 0.40: a fresh install already ships a default `users` auth collection, so `users` is
// updated in place rather than created. `fields.add()` replaces a field of the same name, which is
// also how `review_events.id` is widened from PocketBase's 15-char id to a 36-char UUIDv7.

migrate(
  (app) => {
    // --- users (auth) -------------------------------------------------------------------
    // Phone-only identity: no password, no email login. The OTP route (ticket 02) is the only
    // way in, so passwordAuth is off and the token lasts a year — a student should not be
    // logged out between two exam seasons.
    let users;
    try {
      users = app.findCollectionByNameOrId('users');
    } catch {
      users = new Collection({ type: 'auth', name: 'users' });
    }

    users.listRule = '@request.auth.id = id';
    users.viewRule = '@request.auth.id = id';
    users.createRule = null;
    users.updateRule = null;
    users.deleteRule = null;
    users.manageRule = null;
    users.authRule = '';
    users.passwordAuth = { enabled: false, identityFields: [] };
    users.oauth2 = { enabled: false, providers: [] };
    users.mfa = { enabled: false, duration: 1800, rule: '' };
    users.otp = { enabled: false, duration: 180, length: 8 };
    users.authToken = { duration: 31536000 }; // 365 days

    // Identity here is the phone number. PocketBase's default `users` collection requires an
    // email; ours must not, because the OTP flow (ticket 02) creates a record from a phone alone.
    const emailField = users.fields.getByName('email');
    if (emailField) emailField.required = false;

    users.fields.add(
      new TextField({
        name: 'phone',
        required: true,
        max: 16,
        // E.164: a leading + and 8-15 digits. Iranian mobiles normalise to +989XXXXXXXXX.
        pattern: '^\\+[1-9]\\d{7,14}$',
      }),
      new JSONField({
        name: 'profile',
        maxSize: 4096, // minutes, goal, examDate, fieldCode, updatedAt
      }),
      new DateField({ name: 'lastSeenAt' }),
    );

    users.indexes = [
      'CREATE UNIQUE INDEX `idx_users_phone` ON `users` (`phone`)',
      'CREATE UNIQUE INDEX `idx_users_tokenKey` ON `users` (`tokenKey`)',
      "CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`) WHERE `email` != ''",
    ];

    app.save(users);

    const usersId = app.findCollectionByNameOrId('users').id;

    // --- review_events ------------------------------------------------------------------
    // The append-only log (ADR-0002). The id is the device's UUIDv7, which is what makes
    // `push` idempotent: a replayed event collides on the primary key and is ignored.
    const reviewEvents = new Collection({
      type: 'base',
      name: 'review_events',
      // No direct API access: only the sync routes (§8.2).
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'id',
          type: 'text',
          system: true,
          required: true,
          primaryKey: true,
          min: 36,
          max: 36,
          pattern: '^[0-9a-f-]{36}$',
          // Never server-generated: an event without a device id is not an event.
          autogeneratePattern: '',
        },
        {
          name: 'user',
          type: 'relation',
          required: true,
          maxSelect: 1,
          collectionId: usersId,
          cascadeDelete: true,
        },
        { name: 'itemId', type: 'text', required: true, max: 64 },
        { name: 'at', type: 'number', required: true, onlyInt: true },
        { name: 'kind', type: 'select', required: true, maxSelect: 1, values: ['review', 'know'] },
        // grade is 0 | 1, and 0 is a legitimate value, so it cannot be `required`.
        { name: 'grade', type: 'number', onlyInt: true, min: 0, max: 1 },
        { name: 'device', type: 'text', max: 64 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      indexes: [
        // The pull cursor is (created, id), so this is the index that serves every pull.
        'CREATE INDEX `idx_review_events_user_created` ON `review_events` (`user`, `created`)',
      ],
    });
    app.save(reviewEvents);

    // --- payments -----------------------------------------------------------------------
    // Created before entitlements: entitlements.payment points at it.
    const payments = new Collection({
      type: 'base',
      name: 'payments',
      listRule: '@request.auth.id = user',
      viewRule: '@request.auth.id = user',
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
        { name: 'listPrice', type: 'number', onlyInt: true },
        { name: 'salePrice', type: 'number', onlyInt: true },
        { name: 'discountCode', type: 'text', max: 32 },
        { name: 'discountAmount', type: 'number', onlyInt: true },
        { name: 'payable', type: 'number', onlyInt: true },
        { name: 'authority', type: 'text', max: 64 },
        { name: 'refId', type: 'text', max: 64 },
        { name: 'cardPan', type: 'text', max: 32 },
        {
          name: 'status',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['pending', 'verified', 'failed', 'expired'],
        },
        { name: 'verifiedAt', type: 'date' },
        { name: 'raw', type: 'json', maxSize: 16384 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX `idx_payments_user` ON `payments` (`user`)',
        'CREATE INDEX `idx_payments_authority` ON `payments` (`authority`)',
        'CREATE INDEX `idx_payments_status` ON `payments` (`status`)',
      ],
    });
    app.save(payments);

    const paymentsId = app.findCollectionByNameOrId('payments').id;

    // --- entitlements -------------------------------------------------------------------
    // The server's answer to "may this device have the paid package" (ADR-0004).
    const entitlements = new Collection({
      type: 'base',
      name: 'entitlements',
      listRule: '@request.auth.id = user',
      viewRule: '@request.auth.id = user',
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
        { name: 'product', type: 'select', required: true, maxSelect: 1, values: ['full'] },
        {
          name: 'source',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['zarinpal', 'manual', 'bazaar'],
        },
        {
          name: 'payment',
          type: 'relation',
          required: false,
          maxSelect: 1,
          collectionId: paymentsId,
          cascadeDelete: false,
        },
        { name: 'grantedAt', type: 'date' },
        { name: 'note', type: 'text', max: 500 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      indexes: ['CREATE INDEX `idx_entitlements_user` ON `entitlements` (`user`)'],
    });
    app.save(entitlements);

    // --- discount_codes -----------------------------------------------------------------
    // Superuser only; managed by hand in the PB admin UI.
    const discountCodes = new Collection({
      type: 'base',
      name: 'discount_codes',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'code', type: 'text', required: true, max: 32, pattern: '^[A-Z0-9_-]+$' },
        {
          name: 'type',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['percent', 'fixed'],
        },
        { name: 'value', type: 'number', required: true, onlyInt: true },
        { name: 'maxUses', type: 'number', onlyInt: true },
        { name: 'usedCount', type: 'number', onlyInt: true },
        { name: 'perUserOnce', type: 'bool' },
        { name: 'expiresAt', type: 'date' },
        { name: 'active', type: 'bool' },
        { name: 'note', type: 'text', max: 500 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      indexes: ['CREATE UNIQUE INDEX `idx_discount_codes_code` ON `discount_codes` (`code`)'],
    });
    app.save(discountCodes);

    // --- otp_codes ----------------------------------------------------------------------
    // Hooks only, purged hourly by cron. The code itself is never stored (§15).
    const otpCodes = new Collection({
      type: 'base',
      name: 'otp_codes',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'phone', type: 'text', required: true, max: 16 },
        { name: 'codeHash', type: 'text', required: true, max: 128 },
        { name: 'expiresAt', type: 'date', required: true },
        { name: 'attempts', type: 'number', onlyInt: true },
        { name: 'ip', type: 'text', max: 64 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      indexes: [
        // Both the rate limit and the verify lookup are by phone.
        'CREATE INDEX `idx_otp_codes_phone` ON `otp_codes` (`phone`)',
        'CREATE INDEX `idx_otp_codes_expiresAt` ON `otp_codes` (`expiresAt`)',
      ],
    });
    app.save(otpCodes);

    // --- word_flags ---------------------------------------------------------------------
    const wordFlags = new Collection({
      type: 'base',
      name: 'word_flags',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'user',
          type: 'relation',
          required: false,
          maxSelect: 1,
          collectionId: usersId,
          cascadeDelete: false,
        },
        { name: 'installId', type: 'text', required: true, max: 64 },
        { name: 'itemId', type: 'text', required: true, max: 64 },
        {
          name: 'reason',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['translation', 'example', 'hint'],
        },
        { name: 'appVersion', type: 'text', max: 32 },
        { name: 'at', type: 'number', onlyInt: true },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      indexes: [
        'CREATE INDEX `idx_word_flags_itemId` ON `word_flags` (`itemId`)',
        'CREATE INDEX `idx_word_flags_installId_created` ON `word_flags` (`installId`, `created`)',
      ],
    });
    app.save(wordFlags);

    // --- beacons ------------------------------------------------------------------------
    const beacons = new Collection({
      type: 'base',
      name: 'beacons',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'installId', type: 'text', required: true, max: 64 },
        {
          name: 'user',
          type: 'relation',
          required: false,
          maxSelect: 1,
          collectionId: usersId,
          cascadeDelete: false,
        },
        {
          name: 'name',
          type: 'select',
          required: true,
          maxSelect: 1,
          // The fixed list of §8.4. Adding one is a change to what.md in the same commit.
          values: [
            'first_open',
            'onboarding_done',
            'first_review',
            'reviews_10',
            'reviews_100',
            'paywall_shown',
            'login_done',
            'purchase_started',
            'purchase_done',
            'download_done',
            'install_prompt_shown',
            'install_prompt_accepted',
            'season_shown',
          ],
        },
        { name: 'at', type: 'number', onlyInt: true },
        { name: 'appVersion', type: 'text', max: 32 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      indexes: [
        'CREATE INDEX `idx_beacons_name_created` ON `beacons` (`name`, `created`)',
        'CREATE INDEX `idx_beacons_installId` ON `beacons` (`installId`)',
      ],
    });
    app.save(beacons);

    // --- client_errors ------------------------------------------------------------------
    // §10.1. The client record names the user `userId`; on the server it is a relation called
    // `user`, like every other collection here. See how-why.md §5 (2026-09-18).
    const clientErrors = new Collection({
      type: 'base',
      name: 'client_errors',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'kind',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: [
            'error',
            'unhandledrejection',
            'react',
            'sw',
            'sync',
            'download',
            'payment',
            'user_report',
          ],
        },
        { name: 'fingerprint', type: 'text', required: true, max: 64 },
        { name: 'message', type: 'text', max: 2000 },
        { name: 'stack', type: 'text', max: 20000 },
        { name: 'appVersion', type: 'text', max: 32 },
        { name: 'buildSha', type: 'text', max: 64 },
        { name: 'route', type: 'text', max: 200 },
        { name: 'installId', type: 'text', required: true, max: 64 },
        {
          name: 'user',
          type: 'relation',
          required: false,
          maxSelect: 1,
          collectionId: usersId,
          cascadeDelete: false,
        },
        { name: 'at', type: 'number', onlyInt: true },
        { name: 'online', type: 'bool' },
        { name: 'device', type: 'json', maxSize: 4096 },
        { name: 'breadcrumbs', type: 'json', maxSize: 65536 },
        { name: 'snapshot', type: 'json', maxSize: 65536 },
        { name: 'userNote', type: 'text', max: 500 },
        { name: 'count', type: 'number', onlyInt: true },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        // The hour-window dedupe of §8.2 looks up (fingerprint, created).
        'CREATE INDEX `idx_client_errors_fingerprint_created` ON `client_errors` (`fingerprint`, `created`)',
        'CREATE INDEX `idx_client_errors_installId_created` ON `client_errors` (`installId`, `created`)',
      ],
    });
    app.save(clientErrors);

    // --- app_config ---------------------------------------------------------------------
    // One record, publicly readable: the client displays prices, the server decides them (§8.3).
    const appConfig = new Collection({
      type: 'base',
      name: 'app_config',
      listRule: '',
      viewRule: '',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'listPrice', type: 'number', required: true, onlyInt: true },
        { name: 'salePrice', type: 'number', required: true, onlyInt: true },
        { name: 'freePresentationLimit', type: 'number', required: true, onlyInt: true },
        { name: 'minAppVersion', type: 'text', max: 32 },
        { name: 'supportUrl', type: 'text', max: 200 },
        { name: 'notice', type: 'text', max: 1000 },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    });
    app.save(appConfig);

    // Seed the single record. Prices are toman (§8.3).
    const config = new Record(app.findCollectionByNameOrId('app_config'));
    config.set('listPrice', 450000);
    config.set('salePrice', 290000);
    config.set('freePresentationLimit', 100);
    config.set('minAppVersion', '0.1.0');
    config.set('supportUrl', '');
    config.set('notice', '');
    app.save(config);
  },

  (app) => {
    // Down: drop everything this migration created, children before parents.
    const names = [
      'app_config',
      'client_errors',
      'beacons',
      'word_flags',
      'otp_codes',
      'discount_codes',
      'entitlements',
      'payments',
      'review_events',
    ];

    for (const name of names) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch {
        // Already gone: a down migration has to be safe to run twice.
      }
    }

    // `users` is PocketBase's own default collection, so it is reverted, not deleted.
    try {
      const users = app.findCollectionByNameOrId('users');
      users.fields.removeByName('phone');
      users.fields.removeByName('profile');
      users.fields.removeByName('lastSeenAt');
      users.indexes = [
        'CREATE UNIQUE INDEX `idx_users_tokenKey` ON `users` (`tokenKey`)',
        "CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`) WHERE `email` != ''",
      ];
      users.passwordAuth = { enabled: true, identityFields: ['email'] };
      users.authToken = { duration: 1209600 };
      app.save(users);
    } catch {
      // Nothing to revert.
    }
  },
);
