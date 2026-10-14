import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScenario, validateScenario, MAX_HEADERS } from '../src/scenario.js';

const scenario = () => ({ schemaVersion: 1, policies: { a: 'Cache-Control: max-age=60', b: 'Cache-Control: no-cache' }, elapsed: 75, context: { varyMatches: true }, horizon: 1200 });
test('scenario round trip preserves headers and context, drops unknown data', () => {
  const data = scenario();
  data.context.responseTime = '2026-10-14T10:00:00Z';
  data.context.requestTime = '2026-10-14T09:59:59Z';
  data.untrusted = '<script>bad()</script>';
  const parsed = parseScenario(JSON.stringify(data));
  assert.equal(parsed.policies.a, data.policies.a);
  assert.equal(parsed.context.responseTime, data.context.responseTime);
  assert.equal(parsed.context.originError, false);
  assert.equal(Object.hasOwn(parsed, 'untrusted'), false);
});
test('scenario rejects wrong versions, non-boolean switches, invalid clocks and oversized data', () => {
  assert.throws(() => validateScenario({ ...scenario(), schemaVersion: 2 }), /schemaVersion/);
  assert.throws(() => validateScenario({ ...scenario(), elapsed: Infinity }), /Elapsed/);
  assert.throws(() => validateScenario({ ...scenario(), elapsed: -1 }), /Elapsed/);
  assert.throws(() => validateScenario({ ...scenario(), context: { authenticated: 'false' } }), /boolean/);
  assert.throws(() => validateScenario({ ...scenario(), context: { responseTime: 'yesterday' } }), /ISO/);
  assert.throws(() => validateScenario({ ...scenario(), context: { responseTime: '2026-10-14T10:00' } }), /timezone/);
  assert.throws(() => validateScenario({ ...scenario(), context: { responseTime: '2026-02-31T10:00:00Z' } }), /calendar/);
  assert.throws(() => validateScenario({ ...scenario(), context: { responseTime: '2026-10-14T09:00:00Z', requestTime: '2026-10-14T10:00:00Z' } }), /later/);
  assert.throws(() => validateScenario({ ...scenario(), policies: { a: 'x'.repeat(MAX_HEADERS + 1), b: '' } }), /64 KiB/);
  assert.throws(() => validateScenario({ ...scenario(), policies: { a: '中'.repeat(22000), b: '' } }), /64 KiB/);
  assert.throws(() => validateScenario({ ...scenario(), policies: { a: '"'.repeat(50000), b: '"'.repeat(50000) } }), /JSON encoding/);
  assert.throws(() => parseScenario('x'.repeat(160 * 1024 + 1)), /160 KiB/);
  assert.throws(() => parseScenario('{} not JSON'), /valid JSON/);
});
