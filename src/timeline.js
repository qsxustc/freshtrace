import { analyzeHeaders } from './cache.js';

/** Reusable intervals in seconds after receipt, using the engine's actual permissions. */
export function buildTimeline(result, options = {}, horizon) {
  if (!Number.isFinite(horizon) || horizon <= 0) throw new TypeError('Timeline horizon must be a finite positive number of seconds.');
  const lifetime = result.freshnessLifetime;
  if (lifetime === null) return [];
  const freshEnd = lifetime - result.baseAge;
  const boundaries = [...new Set([0, freshEnd, freshEnd + result.staleWhileRevalidate, freshEnd + result.staleIfError, horizon]
    .map(value => Math.max(0, Math.min(horizon, value))))].sort((a, b) => a - b);
  const segments = [];
  for (let index = 0; index < boundaries.length - 1; index++) {
    const start = boundaries[index], end = boundaries[index + 1];
    const at = analyzeHeaders(result.headers, { ...options, elapsed: start + (end - start) / 2, cacheType: result.cacheType });
    if (['fresh', 'swr', 'sie'].includes(at.state)) segments.push({ start, end, state: at.state });
  }
  return segments;
}
