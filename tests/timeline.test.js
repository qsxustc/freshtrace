import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeHeaders } from '../src/cache.js';
import { buildTimeline } from '../src/timeline.js';

const date = 'Wed, 14 Oct 2026 10:00:00 GMT';
function timeline(control, context = {}, extra = {}, cacheType = 'private', horizon = 200) {
  const result = analyzeHeaders({ Date: date, 'Cache-Control': control, ...extra }, { ...context, cacheType });
  return buildTimeline(result, context, horizon);
}

test('timeline shifts freshness and stale windows relative to age at receipt', () => {
  assert.deepEqual(timeline('max-age=60, stale-while-revalidate=60', {}, { Age: '90' }), [
    { start: 0, end: 30, state: 'swr' },
  ]);
  assert.deepEqual(timeline('max-age=60', {}, { Age: '15' }), [
    { start: 0, end: 45, state: 'fresh' },
  ]);
  assert.deepEqual(timeline('max-age=60, stale-while-revalidate=30', {}, { Age: '120' }), []);
});

test('invalid or ambiguous age/policy cannot paint optimistic fresh intervals', () => {
  assert.deepEqual(timeline('max-age=3600', {}, { Age: 'invalid' }), []);
  assert.deepEqual(timeline('max-age=60, max-age=3600'), []);
  assert.deepEqual(timeline('max-age=3600', {}, { Date: 'invalid' }), []);
  assert.deepEqual(timeline('max-age=3600', {}, { Vary: 'invalid field name' }), []);
});

test('Vary mismatch matters only when the response actually names Vary fields', () => {
  assert.deepEqual(timeline('max-age=60', { varyMatches: false }), [{ start: 0, end: 60, state: 'fresh' }]);
  assert.deepEqual(timeline('max-age=60', { varyMatches: false }, { Vary: 'Accept-Encoding' }), []);
  assert.deepEqual(timeline('max-age=60', {}, { Vary: '*' }), []);
});

test('SIE takes precedence during an origin error, including overlap with SWR', () => {
  const control = 'max-age=60, stale-while-revalidate=30, stale-if-error=120';
  assert.deepEqual(timeline(control, { originError: true }), [
    { start: 0, end: 60, state: 'fresh' },
    { start: 60, end: 90, state: 'sie' },
    { start: 90, end: 180, state: 'sie' },
  ]);
  assert.deepEqual(timeline(control), [
    { start: 0, end: 60, state: 'fresh' },
    { start: 60, end: 90, state: 'swr' },
  ]);
  assert.deepEqual(timeline('max-age=60, stale-while-revalidate=120, stale-if-error=30', { originError: true }), [
    { start: 0, end: 60, state: 'fresh' },
    { start: 60, end: 90, state: 'sie' },
    { start: 90, end: 180, state: 'swr' },
  ]);
});

test('revalidation restrictions retain fresh intervals and suppress stale windows', () => {
  const extensions = 'max-age=60, stale-while-revalidate=30, stale-if-error=120';
  for (const [flag, type] of [['must-revalidate', 'private'], ['proxy-revalidate', 'shared'], ['s-maxage=60', 'shared']]) {
    const segments = timeline(`${extensions}, ${flag}`, { originError: true }, {}, type);
    assert.ok(segments.length > 0, flag);
    assert.equal(segments[0].start, 0, flag);
    assert.equal(segments.at(-1).end, 60, flag);
    assert.ok(segments.every(segment => segment.state === 'fresh'), flag);
  }
  assert.deepEqual(timeline(`${extensions}, no-cache`), []);
  assert.deepEqual(timeline(`${extensions}, no-cache="ETag"`), []);
  assert.deepEqual(timeline(`${extensions}, no-store`), []);
  assert.deepEqual(timeline(`${extensions}, private="Set-Cookie"`, {}, {}, 'shared'), []);
});

test('missing TTL produces no inferred freshness, and the horizon clips valid windows', () => {
  assert.deepEqual(timeline('public, immutable'), []);
  assert.deepEqual(timeline('max-age=60', {}, {}, 'private', 30), [{ start: 0, end: 30, state: 'fresh' }]);
  assert.deepEqual(timeline('max-age=60, stale-while-revalidate=60', {}, {}, 'private', 90), [
    { start: 0, end: 60, state: 'fresh' }, { start: 60, end: 90, state: 'swr' },
  ]);
});
