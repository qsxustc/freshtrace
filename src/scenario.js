import { analyzeHeaders } from './cache.js';

export const MAX_HEADERS = 64 * 1024;
const MAX_SECONDS = 2147483648;
const encoder = new TextEncoder();
const byteLength = value => encoder.encode(value).byteLength;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validateScenario(input) {
  if (!plain(input) || input.schemaVersion !== 1) throw new Error('Expected a FreshTrace scenario with schemaVersion: 1.');
  if (!plain(input.policies)) throw new Error('Scenario is missing its policies.');
  const policies = {};
  for (const name of ['a', 'b']) {
    const value = input.policies[name];
    if (typeof value !== 'string' || value.length > MAX_HEADERS || byteLength(value) > MAX_HEADERS) throw new Error(`Policy ${name.toUpperCase()} must be a header string under 64 KiB.`);
    policies[name] = value;
  }
  if (!Number.isFinite(input.elapsed) || input.elapsed < 0 || input.elapsed > MAX_SECONDS) throw new Error('Elapsed must be between 0 and 2147483648 seconds.');
  const rawContext = input.context ?? {};
  if (!plain(rawContext)) throw new Error('Scenario context must be an object.');
  const context = {};
  for (const [key, fallback] of [['originError', false], ['authenticated', false], ['varyMatches', true]]) {
    const value = rawContext[key] ?? fallback;
    if (typeof value !== 'boolean') throw new Error(`Context ${key} must be a boolean.`);
    context[key] = value;
  }
  for (const key of ['responseTime', 'requestTime']) {
    const value = rawContext[key];
    if (value === undefined || value === '') continue;
    if (typeof value !== 'string' || value.length > 64) throw new Error(`Context ${key} must be an ISO 8601 timestamp.`);
    context[key] = value;
  }
  // The engine validates timezone, calendar components, and clock ordering.
  analyzeHeaders('', context);
  const horizon = input.horizon ?? 1200;
  if (!Number.isFinite(horizon) || horizon < 1 || horizon > MAX_SECONDS) throw new Error('Timeline horizon must be between 1 and 2147483648 seconds.');
  const result = { schemaVersion: 1, policies, elapsed: input.elapsed, context, horizon };
  if (byteLength(JSON.stringify(result, null, 2) + '\n') > 160 * 1024) throw new Error('Scenario exceeds 160 KiB after JSON encoding; shorten the headers before saving.');
  return result;
}

export function parseScenario(text) {
  if (typeof text !== 'string' || text.length > 160 * 1024 || byteLength(text) > 160 * 1024) throw new Error('Scenario must be a JSON file under 160 KiB.');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
  return validateScenario(data);
}
