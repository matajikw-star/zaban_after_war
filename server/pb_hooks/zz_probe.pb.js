/// probe — temporary, deleted before commit.
routerAdd('POST', '/api/probe/create', (e) => {
  const out = {};
  try {
    const col = $app.findCollectionByNameOrId('users');
    const rec = new Record(col);
    rec.set('phone', '+989120000001');
    rec.setPassword($security.randomString(40));
    $app.save(rec);
    out.created = rec.id;
    out.fullToken = rec.newAuthToken();
  } catch (err) {
    out.err = String(err && err.message ? err.message : err);
  }
  try {
    out.code = $security.randomStringWithAlphabet(5, '0123456789');
  } catch (err) {
    out.codeErr = String(err);
  }
  try {
    e.response.header().set('Retry-After', '42');
    out.headerOk = true;
  } catch (err) {
    out.headerErr = String(err);
  }
  try {
    out.ip = e.realIP();
  } catch (err) {
    out.ipErr = String(err);
  }
  try {
    out.rules = JSON.stringify($app.settings().rateLimits);
  } catch (err) {
    out.rulesErr = String(err);
  }
  try {
    out.tokenDuration = $app.findCollectionByNameOrId('users').authToken.duration;
  } catch (err) {
    out.tdErr = String(err);
  }
  return e.json(200, out);
});

routerAdd('POST', '/api/probe/authresp', (e) => {
  const out = {};
  try {
    const rec = $app.findFirstRecordByFilter('users', 'phone = "+989120000001"');
    $apis.recordAuthResponse(e, rec, 'otp');
    out.after = 'reached';
  } catch (err) {
    out.err = String(err && err.message ? err.message : err);
  }
  return e.json(200, out);
});

routerAdd('POST', '/api/probe/filter', (e) => {
  const out = {};
  try {
    const rows = $app.findRecordsByFilter(
      'otp_codes',
      'phone = {:phone} && created > {:since}',
      '-created',
      10,
      0,
      { phone: '+989120000001', since: '2020-01-01 00:00:00.000Z' },
    );
    out.rows = rows.length;
  } catch (err) {
    out.err = String(err && err.message ? err.message : err);
  }
  try {
    const d = new Date(Date.now() + 180000).toISOString();
    out.iso = d;
    const col = $app.findCollectionByNameOrId('otp_codes');
    const rec = new Record(col);
    rec.set('phone', '+989120000001');
    rec.set('codeHash', 'x$y');
    rec.set('expiresAt', d);
    rec.set('attempts', 0);
    rec.set('ip', '127.0.0.1');
    $app.save(rec);
    out.saved = rec.id;
    out.readBack = rec.getDateTime('expiresAt').string();
    out.expired = rec.getDateTime('expiresAt').time() < new Date();
  } catch (err) {
    out.saveErr = String(err && err.message ? err.message : err);
  }
  return e.json(200, out);
});
