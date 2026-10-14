import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeHeaders, parseHeaders, parseCacheControl } from '../src/cache.js';

const date = 'Wed, 14 Oct 2026 10:00:00 GMT';
const nextMinute = 'Wed, 14 Oct 2026 10:01:00 GMT';
const etag = '"version-1"';
const analyze = (control, options = {}, extra = {}) => analyzeHeaders({ Date: date, 'Cache-Control': control, ETag: etag, ...extra }, options);

test('header block accepts status, repeated case-insensitive fields, and preserves Date commas', () => {
  assert.deepEqual(parseHeaders(`HTTP/2 200\r\nDATE: ${date}\r\nCache-Control: public\r\ncache-control: max-age=60\r\nVary: Accept-Encoding\r\nVary: Accept-Language\r\n`), {
    date, 'cache-control': 'public, max-age=60', vary: 'Accept-Encoding, Accept-Language',
  });
  assert.deepEqual(parseHeaders({ AGE: 3, Age: ['4', '5'] }), { age: '3, 4, 5' });
});

test('quoted commas and escaped quotes do not break the directive list', () => {
  assert.deepEqual(parseCacheControl('MAX-AGE="60", Private="X-Secret, X-User", example="a\\"b,c", public'), [
    { name: 'max-age', value: '60' }, { name: 'private', value: 'X-Secret, X-User' },
    { name: 'example', value: 'a"b,c' }, { name: 'public', value: null },
  ]);
  assert.deepEqual(parseCacheControl(', , max-age=30,, '), [{ name: 'max-age', value: '30' }]);
});

test('explicit non-200 status lines are rejected instead of being modeled as GET 200', () => {
  for (const status of ['101 Switching Protocols', '204 No Content', '206 Partial Content', '302 Found', '304 Not Modified', '404 Not Found', '500 Internal Server Error']) {
    const block = `HTTP/1.1 ${status}\nCache-Control: max-age=3600`;
    assert.throws(() => parseHeaders(block), /Only a GET 200 response is supported/);
    assert.throws(() => analyzeHeaders(block), /Only a GET 200 response is supported/);
  }
  for (const version of ['1.0', '1.1', '2', '3']) {
    assert.equal(analyzeHeaders(`HTTP/${version} 200 OK\nCache-Control: max-age=60`).state, 'fresh');
  }
});

test('freshness ends exactly at max-age, with conditional validation', () => {
  assert.equal(analyze('max-age=60', { elapsed: 59.999 }).state, 'fresh');
  const boundary = analyze('max-age=60', { elapsed: 60 });
  assert.equal(boundary.state, 'revalidate');
  assert.equal(boundary.action, 'validate');
  assert.equal(boundary.validator, 'etag');
  assert.equal(analyze('max-age=0').state, 'revalidate');
});

test('explicit lifetime priority is shared s-maxage, max-age, Expires', () => {
  const shared = analyze('max-age=60, s-maxage=120', { cacheType: 'shared' }, { Expires: '0' });
  assert.equal(shared.freshnessLifetime, 120);
  assert.equal(shared.freshnessSource, 's-maxage');
  assert.equal(shared.state, 'fresh');
  assert.equal(shared.blockingStale, true);
  assert.equal(analyze('max-age=60, s-maxage=120').freshnessLifetime, 60);
  const expires = analyze('', {}, { Expires: nextMinute });
  assert.equal(expires.freshnessLifetime, 60);
  assert.equal(expires.freshnessSource, 'expires');
});

test('Expires uses response receipt only when Date is absent', () => {
  const raw = { Expires: nextMinute };
  assert.equal(analyzeHeaders(raw).freshnessLifetime, null);
  assert.equal(analyzeHeaders(raw).state, 'unknown');
  assert.equal(analyzeHeaders(raw, { responseTime: '2026-10-14T10:00:00Z' }).freshnessLifetime, 60);
  assert.equal(analyze('', {}, { Expires: 'Wed, 14 Oct 2026 09:59:00 GMT' }).freshnessLifetime, 0);
  assert.equal(analyze('', {}, { Expires: '0' }).state, 'revalidate');
});

test('initial age takes maximum of apparent age and Age plus transit', () => {
  const options = { responseTime: '2026-10-14T10:00:20Z', requestTime: '2026-10-14T10:00:15Z', elapsed: 8 };
  const response = analyze('max-age=60', options, { Age: '30' });
  assert.equal(response.baseAge, 35);
  assert.equal(response.currentAge, 43);
  assert.equal(analyze('max-age=60', options, { Age: '1' }).baseAge, 20);
  assert.equal(analyze('max-age=60', { elapsed: 8 }, { Age: '30' }).currentAge, 38);
  assert.equal(analyze('max-age=60', { responseTime: '2026-10-14T09:59:00Z' }).baseAge, 0);
  assert.equal(analyze('max-age=60', { requestTime: '2026-10-14T10:00:05Z' }, { Age: '7' }).baseAge, 7);
  assert.throws(() => analyze('max-age=60', { requestTime: '2026-10-14T10:00:05Z', responseTime: '2026-10-14T10:00:00Z' }), /requestTime must not be later/);
});

test('time calculations are deterministic and do not consult Date.now', () => {
  const original = Date.now;
  try {
    Date.now = () => { throw new Error('System clock must not be consulted'); };
    const response = analyze('max-age=60', { elapsed: 10 });
    assert.equal(response.baseAge, 0);
    assert.equal(response.currentAge, 10);
    assert.equal(response.state, 'fresh');
    assert.equal(analyzeHeaders({ 'Cache-Control': 'max-age=60' }).state, 'fresh');
  } finally { Date.now = original; }
});

test('SWR starts at expiry and ends before its upper boundary', () => {
  assert.equal(analyze('max-age=60, stale-while-revalidate=30', { elapsed: 60 }).state, 'swr');
  assert.equal(analyze('max-age=60, stale-while-revalidate=30', { elapsed: 89.999 }).action, 'background-validation');
  assert.equal(analyze('max-age=60, stale-while-revalidate=30', { elapsed: 90 }).state, 'revalidate');
  assert.equal(analyze('max-age=60, stale-while-revalidate=0', { elapsed: 60 }).state, 'revalidate');
});

test('SIE requires an origin error and honors maximum staleness inclusively', () => {
  assert.equal(analyze('max-age=60, stale-if-error=30', { elapsed: 75 }).state, 'revalidate');
  assert.equal(analyze('max-age=60, stale-if-error=30', { elapsed: 75, originError: true }).state, 'sie');
  assert.equal(analyze('max-age=60, stale-if-error=30', { elapsed: 90, originError: true }).state, 'sie');
  assert.equal(analyze('max-age=60, stale-if-error=30', { elapsed: 90.001, originError: true }).state, 'blocked');
  assert.equal(analyze('max-age=60, stale-if-error=30', { elapsed: 59, originError: true }).state, 'fresh');
});

test('applicable revalidation restrictions block SWR and SIE', () => {
  for (const [directive, cacheType] of [['must-revalidate', 'private'], ['proxy-revalidate', 'shared'], ['s-maxage=60', 'shared'], ['no-cache', 'private']]) {
    const result = analyze(`max-age=60, stale-while-revalidate=30, stale-if-error=120, ${directive}`, { elapsed: 65, cacheType, originError: true });
    assert.equal(result.blockingStale, true, directive);
    assert.equal(result.state, 'blocked', directive);
  }
  assert.equal(analyze('max-age=60, stale-while-revalidate=30, proxy-revalidate', { elapsed: 65 }).state, 'swr');
  assert.equal(analyze('max-age=60, stale-while-revalidate=30, s-maxage=60', { elapsed: 65 }).state, 'swr');
});

test('no-cache allows storage but always needs origin validation', () => {
  const response = analyze('max-age=3600, no-cache');
  assert.equal(response.storeAllowed, true);
  assert.equal(response.state, 'revalidate');
  assert.equal(response.blockingStale, true);
  assert.equal(analyze('no-cache="X-Secret", max-age=3600').state, 'revalidate');
  assert.match(analyze('no-cache="X-Secret"').warnings.join(' '), /entire response/);
});

test('no-store and shared private prohibit storage, even with public', () => {
  assert.equal(analyze('max-age=3600, no-store').storeAllowed, false);
  assert.equal(analyze('max-age=3600, no-store').state, 'fetch');
  assert.equal(analyze('max-age=3600, private').state, 'fresh');
  const response = analyze('max-age=3600, public, private', { cacheType: 'shared' });
  assert.equal(response.storeAllowed, false);
  assert.match(response.warnings.join(' '), /private restriction wins/);
  assert.equal(analyze('max-age=3600, private="X-Secret"', { cacheType: 'shared' }).storeAllowed, false);
});

test('shared Authorization permission accepts only the defined overrides', () => {
  const options = { cacheType: 'shared', authenticated: true };
  assert.equal(analyze('max-age=60', options).storeAllowed, false);
  for (const permission of ['public', 'must-revalidate', 's-maxage=60']) {
    assert.equal(analyze(`max-age=60, ${permission}`, options).state, 'fresh', permission);
  }
  assert.equal(analyze('max-age=60, proxy-revalidate', options).storeAllowed, false);
  assert.equal(analyze('max-age=60, s-maxage=nope', options).storeAllowed, false);
  assert.equal(analyze('max-age=60, public, private', options).storeAllowed, false);
  assert.equal(analyze('max-age=60', { authenticated: true }).state, 'fresh');
});

test('Vary mismatch and wildcard prevent selection even for a fresh response', () => {
  const response = analyze('max-age=60', {}, { Vary: 'Accept-Encoding, ACCEPT-LANGUAGE, accept-encoding' });
  assert.deepEqual(response.vary, ['accept-encoding', 'accept-language']);
  assert.equal(response.state, 'fresh');
  assert.equal(analyze('max-age=60', { varyMatches: false }, { Vary: 'Accept-Encoding' }).state, 'fetch');
  assert.equal(analyze('max-age=60', {}, { Vary: '*' }).state, 'fetch');
  assert.equal(analyze('max-age=60', { originError: true }, { Vary: '*' }).state, 'blocked');
  assert.equal(analyze('max-age=60', {}, { Vary: 'invalid field' }).state, 'fetch');
});

test('missing TTL remains unknown instead of inventing a last-modified heuristic', () => {
  const result = analyzeHeaders({ Date: date, 'Last-Modified': 'Wed, 14 Oct 2026 09:00:00 GMT' });
  assert.equal(result.freshnessLifetime, null);
  assert.equal(result.state, 'unknown');
  assert.equal(result.validator, 'last-modified');
  assert.equal(result.storeAllowed, true);
  assert.equal(analyze('public, immutable').state, 'unknown');
});

test('valid ETag is preferred; fallback to Last-Modified requires a valid HTTP date', () => {
  assert.equal(analyze('max-age=0', {}, { 'Last-Modified': date }).validator, 'etag');
  assert.equal(analyze('max-age=0', {}, { ETag: 'W/"version-1"' }).validator, 'etag');
  const fallback = analyze('max-age=0', {}, { ETag: 'unquoted', 'Last-Modified': date });
  assert.equal(fallback.validator, 'last-modified');
  assert.match(fallback.reason, /If-Modified-Since/);
  assert.equal(analyze('max-age=0', {}, { ETag: 'unquoted', 'Last-Modified': 'yesterday' }).state, 'fetch');
});

test('malformed, duplicated, negative or fractional policy never becomes optimistic fresh', () => {
  for (const policy of ['max-age=60, max-age=60', 'max-age=-1', 'max-age=1.5', 'max-age=oops', 'max-age', 'max-age=', 'max-age="60', 'max-age=60, public=1', 'max-age=60, malformed directive']) {
    const response = analyze(policy);
    assert.equal(response.state, 'revalidate', policy);
    assert.equal(response.blockingStale, true, policy);
    assert.ok(response.warnings.length, policy);
  }
  assert.equal(analyze('max-age=oops', {}, { Expires: nextMinute }).freshnessLifetime, 0);
  assert.equal(analyzeHeaders(`Date: ${date}\nCache-Control: max-age=60\nCache-Control: max-age=90`).state, 'fetch');
});

test('malformed Age and Date or repeated singleton headers do not become fresh', () => {
  for (const badAge of ['-1', '1.5', 'not-a-number', '10, 20']) assert.equal(analyze('max-age=60', {}, { Age: badAge }).state, 'revalidate');
  for (const badDate of ['2026-10-14', 'Wed, 31 Feb 2026 10:00:00 GMT', `${date}, ${date}`, 'Wed, 14 Oct 2026 10:00:00 PST']) {
    assert.equal(analyze('max-age=60', {}, { Date: badDate }).state, 'revalidate', badDate);
  }
  assert.equal(analyze('', {}, { Expires: [nextMinute, nextMinute] }).state, 'revalidate');
});

test('huge delta seconds saturate safely without wraparound or Infinity', () => {
  const huge = '9'.repeat(500);
  const result = analyze(`max-age=${huge}`, { elapsed: Number.MAX_VALUE }, { Age: huge });
  assert.equal(result.freshnessLifetime, Number.MAX_SAFE_INTEGER);
  assert.equal(result.currentAge, Number.MAX_SAFE_INTEGER);
  assert.equal(result.state, 'revalidate');
  assert.equal(Number.isFinite(result.baseAge), true);
  assert.equal(Number.isFinite(result.currentAge), true);
});

test('well-formed unknown directives warn and do not change known freshness', () => {
  const result = analyze('max-age=60, vendor="a,b", min-fresh=100, immutable');
  assert.equal(result.state, 'fresh');
  assert.match(result.warnings.join(' '), /vendor.*ignored/);
  assert.match(result.warnings.join(' '), /min-fresh.*ignored/);
  assert.match(result.notes.join(' '), /immutable does not extend freshness/);
});

test('date parsing is case-insensitive and rejects impossible calendar dates', () => {
  assert.equal(analyze('', {}, { Date: date.toLowerCase(), Expires: nextMinute.toLowerCase() }).freshnessLifetime, 60);
  assert.equal(analyze('', {}, { Expires: 'Wed, 31 Feb 2026 10:01:00 GMT' }).state, 'revalidate');
  assert.equal(analyze('', { responseTime: '2026-10-14T10:00:00Z' }, { Date: 'Wednesday, 14-Oct-26 10:00:00 GMT', Expires: nextMinute }).freshnessLifetime, 60);
  assert.equal(analyze('', {}, { Date: 'Wed Oct 14 10:00:00 2026', Expires: nextMinute }).freshnessLifetime, 60);
});

test('invalid input shapes and options produce clear errors', () => {
  for (const input of [null, [], new Date(), 42]) assert.throws(() => parseHeaders(input), /Headers must/);
  assert.throws(() => parseHeaders({ Age: true }), /Header Age/);
  assert.throws(() => parseHeaders({ 'Bad Name': 'x' }), /Invalid header name/);
  assert.throws(() => parseHeaders('not a header'), /expected Name: value/);
  assert.throws(() => parseHeaders('HTTP/1.1 200 OK\nAge: 1\nHTTP/2 200\nAge: 2'), /one response/);
  assert.throws(() => parseCacheControl(60), /must be a string/);
  for (const options of [{ elapsed: -1 }, { elapsed: '5' }, { elapsed: null }, { elapsed: Infinity }, { cacheType: 'browser' }, { cacheType: null }, { originError: 1 }, { varyMatches: null }, { authenticated: 'true' }, { responseTime: 'today' }, { responseTime: '2026-02-31T10:00:00Z' }, { requestTime: '2026-10-14T10:00:00' }, { invented: true }]) {
    assert.throws(() => analyzeHeaders({}, options), TypeError);
  }
});

test('all public result fields stay JSON serializable and input is unmodified', () => {
  const headers = { Date: date, 'Cache-Control': ['max-age=60', 'public'] };
  const snapshot = JSON.stringify(headers);
  const result = analyzeHeaders(headers);
  assert.equal(JSON.stringify(headers), snapshot);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.deepEqual(Object.keys(result).sort(), ['headers', 'directives', 'cacheType', 'baseAge', 'currentAge', 'freshnessLifetime', 'freshnessSource', 'staleWhileRevalidate', 'staleIfError', 'storeAllowed', 'state', 'label', 'reason', 'action', 'validator', 'warnings', 'notes', 'blockingStale', 'vary'].sort());
  const dangerous = parseHeaders(JSON.parse('{"__proto__":"safe"}'));
  assert.equal(Object.getPrototypeOf(dangerous), Object.prototype);
  assert.equal(Object.hasOwn(dangerous, '__proto__'), true);
});
