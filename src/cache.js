// Deterministic GET / 200 response analysis. RFC 9111 §§3–5 and RFC 5861.
// This module describes a cache decision; it never performs network requests.
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const MAX_SECONDS = Number.MAX_SAFE_INTEGER;
const NUMERIC = new Set(['max-age', 's-maxage', 'stale-while-revalidate', 'stale-if-error']);
const FLAGS = new Set(['no-store', 'public', 'must-revalidate', 'proxy-revalidate', 'immutable', 'no-transform', 'must-understand']);
const QUALIFIED = new Set(['private', 'no-cache']);
const KNOWN = new Set([...NUMERIC, ...FLAGS, ...QUALIFIED]);

function plainObject(value) {
  return value !== null && typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

/** Normalize a single response header block or plain header object. Repeats are joined. */
export function parseHeaders(input) {
  const pairs = [];
  if (typeof input === 'string') {
    let last = -1;
    let sawStatus = false;
    for (const [index, line] of input.replace(/\r\n/g, '\n').split('\n').entries()) {
      if (!line.trim()) continue;
      const statusLine = /^HTTP\/\d(?:\.\d)?\s+(\d{3})(?:\s|$)/i.exec(line);
      if (statusLine) {
        if (sawStatus || pairs.length) throw new TypeError('Provide one response header block, not multiple responses.');
        if (statusLine[1] !== '200') throw new TypeError('Only a GET 200 response is supported.');
        sawStatus = true;
        continue;
      }
      if (/^[ \t]/.test(line) && !line.trim().includes(':') && last >= 0) {
        pairs[last][1] += ` ${line.trim()}`;
        continue;
      }
      const colon = line.indexOf(':');
      if (colon <= 0) throw new TypeError(`Invalid header on line ${index + 1}; expected Name: value.`);
      pairs.push([line.slice(0, colon).trim(), line.slice(colon + 1).trim()]);
      last = pairs.length - 1;
    }
  } else if (plainObject(input)) {
    for (const [name, value] of Object.entries(input)) {
      const values = Array.isArray(value) ? value : [value];
      for (const part of values) {
        if (typeof part !== 'string' && (typeof part !== 'number' || !Number.isFinite(part))) {
          throw new TypeError(`Header ${name} must contain strings or finite numbers.`);
        }
        pairs.push([name, String(part).trim()]);
      }
    }
  } else {
    throw new TypeError('Headers must be a response header string or a plain object.');
  }
  const normalized = {};
  for (const [rawName, value] of pairs) {
    const name = rawName.trim().toLowerCase();
    if (!TOKEN.test(name)) throw new TypeError(`Invalid header name: ${rawName}.`);
    if (/[\u0000-\u0008\u000a-\u001f\u007f]/.test(value)) throw new TypeError(`Invalid control character in header ${name}.`);
    const previous = Object.hasOwn(normalized, name) ? `${normalized[name]}, ` : '';
    // defineProperty also makes header names such as __proto__ safe.
    Object.defineProperty(normalized, name, { value: previous + value, writable: true, enumerable: true, configurable: true });
  }
  return normalized;
}

function cacheControlDetails(value) {
  if (typeof value !== 'string') throw new TypeError('Cache-Control must be a string.');
  const segments = [];
  let start = 0;
  let quoted = false;
  let escaped = false;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (escaped) { escaped = false; continue; }
    if (quoted && char === '\\') { escaped = true; continue; }
    if (char === '"') quoted = !quoted;
    if (char === ',' && !quoted) { segments.push(value.slice(start, i)); start = i + 1; }
  }
  segments.push(value.slice(start));
  const directives = [];
  const issues = [];
  if (quoted || escaped) issues.push('Cache-Control contains an unterminated quoted value.');
  for (const segment of segments) {
    const text = segment.trim();
    if (!text) continue; // Empty list elements are permitted by HTTP list parsing.
    const equal = text.indexOf('=');
    const name = (equal < 0 ? text : text.slice(0, equal).trim()).toLowerCase();
    const rawValue = equal < 0 ? null : text.slice(equal + 1).trim();
    if (!TOKEN.test(name)) { issues.push(`Invalid Cache-Control directive: ${text}.`); continue; }
    let decoded = rawValue;
    if (rawValue !== null) {
      if (rawValue.startsWith('"')) {
        if (!/^"(?:[\t !#-\[\]-~\u0080-\u00ff]|\\[\t -~\u0080-\u00ff])*"$/.test(rawValue)) {
          issues.push(`Malformed value for ${name}.`);
        } else decoded = rawValue.slice(1, -1).replace(/\\(.)/g, '$1');
      } else if (!TOKEN.test(rawValue)) issues.push(`Malformed value for ${name}.`);
    }
    directives.push({ name, value: decoded });
  }
  return { directives, issues };
}

/** Parse commas inside quoted values and quoted-pair escapes without losing repeats. */
export function parseCacheControl(value) {
  return cacheControlDetails(value).directives;
}

function delta(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return !Number.isFinite(number) || number > MAX_SECONDS ? MAX_SECONDS : number;
}

function addSeconds(left, right) {
  return Math.min(MAX_SECONDS, left + right);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
// Validate components before using UTC, so impossible dates cannot roll into a fresh policy.
function utcParts(year, month, day, hour, minute, second) {
  if (month < 0 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  const result = new Date(0);
  result.setUTCFullYear(year, month, day);
  result.setUTCHours(hour, minute, second, 0);
  return result.getUTCFullYear() === year && result.getUTCMonth() === month && result.getUTCDate() === day
    ? result.getTime() : null;
}

function httpDate(value, referenceYear = null) {
  if (typeof value !== 'string') return null;
  let match = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{2}) ([a-z]{3}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/i.exec(value);
  if (match) return utcParts(+match[3], MONTHS.indexOf(match[2].toLowerCase()), +match[1], +match[4], +match[5], +match[6]);
  match = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) ([a-z]{3}) ( {1,2}\d{1,2}|\d{2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/i.exec(value);
  if (match) return utcParts(+match[6], MONTHS.indexOf(match[1].toLowerCase()), +match[2], +match[3], +match[4], +match[5]);
  match = /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\d{2})-([a-z]{3})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) GMT$/i.exec(value);
  // RFC 850's two-digit year needs a capture-time anchor for the 50-year rule.
  // Without one, refuse to invent a century using the system clock.
  if (match && referenceYear !== null) {
    let year = Math.floor(referenceYear / 100) * 100 + +match[3];
    if (year > referenceYear + 50) year -= 100;
    return utcParts(year, MONTHS.indexOf(match[2].toLowerCase()), +match[1], +match[4], +match[5], +match[6]);
  }
  return null;
}

function captureTime(value, name) {
  if (value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 8.64e15) return value;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/i.exec(value);
    if (utcParts(+parts[1], +parts[2] - 1, +parts[3], +parts[4], +parts[5], +parts[6]) === null) {
      throw new TypeError(`${name} contains an invalid calendar date or time.`);
    }
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new TypeError(`${name} must be an ISO timestamp with a timezone or epoch milliseconds.`);
}

function readOptions(options) {
  if (!plainObject(options)) throw new TypeError('Options must be a plain object.');
  const allowed = new Set(['elapsed', 'cacheType', 'originError', 'authenticated', 'varyMatches', 'responseTime', 'requestTime']);
  for (const key of Object.keys(options)) if (!allowed.has(key)) throw new TypeError(`Unknown option: ${key}.`);
  const elapsed = options.elapsed === undefined ? 0 : options.elapsed;
  if (typeof elapsed !== 'number' || !Number.isFinite(elapsed) || elapsed < 0) throw new TypeError('elapsed must be a finite nonnegative number of seconds.');
  const cacheType = options.cacheType === undefined ? 'private' : options.cacheType;
  if (cacheType !== 'private' && cacheType !== 'shared') throw new TypeError('cacheType must be private or shared.');
  for (const key of ['originError', 'authenticated', 'varyMatches']) {
    if (options[key] !== undefined && typeof options[key] !== 'boolean') throw new TypeError(`${key} must be a boolean.`);
  }
  const responseTime = captureTime(options.responseTime, 'responseTime');
  const requestTime = captureTime(options.requestTime, 'requestTime');
  if (responseTime !== null && requestTime !== null && requestTime > responseTime) {
    throw new TypeError('requestTime must not be later than responseTime.');
  }
  return {
    elapsed, cacheType, originError: options.originError ?? false,
    authenticated: options.authenticated ?? false, varyMatches: options.varyMatches ?? true,
    responseTime, requestTime,
  };
}

/** Explain storage, age, explicit freshness and the next cache action. */
export function analyzeHeaders(input, options = {}) {
  const headers = parseHeaders(input);
  const settings = readOptions(options);
  const { cacheType, elapsed, originError, authenticated, varyMatches } = settings;
  const shared = cacheType === 'shared';
  const parsed = cacheControlDetails(headers['cache-control'] ?? '');
  const { directives } = parsed;
  const warnings = [...parsed.issues];
  const notes = ['Assumes a complete GET 200 response, a matching URL, and an unchanged stored representation.'];
  let malformed = parsed.issues.length > 0;
  const grouped = new Map();
  for (const directive of directives) {
    const entries = grouped.get(directive.name) ?? [];
    entries.push(directive);
    grouped.set(directive.name, entries);
  }
  const has = name => grouped.has(name);
  const value = name => grouped.get(name)?.[0].value;
  const seconds = new Map();
  for (const [name, entries] of grouped) {
    if (!KNOWN.has(name)) { warnings.push(`Unknown or request-only directive ${name} is ignored.`); continue; }
    if (entries.length > 1) {
      warnings.push(`Repeated ${name} directives are ambiguous; validation is required conservatively.`);
      malformed = true;
    }
    if (NUMERIC.has(name)) {
      const number = delta(entries[0].value);
      if (number === null) { malformed = true; warnings.push(`${name} must be a nonnegative integer; this policy is treated as stale.`); }
      else {
        seconds.set(name, number);
        if (number === MAX_SECONDS) warnings.push(`${name} reaches the safe numeric limit and is saturated to avoid overflow.`);
      }
    } else if (FLAGS.has(name) && entries.some(entry => entry.value !== null)) {
      malformed = true;
      warnings.push(`${name} does not take a value; validation is required conservatively.`);
    } else if (QUALIFIED.has(name) && entries.some(entry => entry.value !== null)) {
      warnings.push(name === 'private'
        ? 'Qualified private is treated as private for the entire response; stripping individual header fields is outside this model.'
        : 'Qualified no-cache is treated as requiring validation of the entire response; field-by-field reuse is outside this model.');
    }
  }
  if (has('public') && has('private')) warnings.push('public and private conflict; the private restriction wins in a shared cache.');
  if (has('immutable')) notes.push('immutable does not extend freshness; reload behavior is outside this model.');
  if (has('no-transform')) notes.push('no-transform constrains representation changes, not freshness.');
  if (has('must-understand')) notes.push('The assumed GET 200 response is understood; no-store is still honored conservatively.');
  if (headers['cdn-cache-control'] || headers['surrogate-control']) warnings.push('CDN-specific cache headers are not interpreted; provider configuration can change the result.');
  if (headers.pragma) warnings.push('Pragma response semantics are not a reliable replacement for Cache-Control and are ignored.');

  const referenceYear = settings.responseTime === null ? null : new Date(settings.responseTime).getUTCFullYear();
  const date = httpDate(headers.date, referenceYear);
  if (Object.hasOwn(headers, 'date') && date === null) { warnings.push('Date is invalid or ambiguous; age cannot be trusted and validation is required.'); malformed = true; }
  const receipt = settings.responseTime ?? date;
  // With absent capture times, Date is receipt, and transmission delay is zero.
  const delay = receipt !== null && settings.requestTime !== null ? Math.max(0, (receipt - settings.requestTime) / 1000) : 0;
  if (receipt !== null && settings.requestTime !== null && settings.requestTime > receipt) warnings.push('requestTime is later than receipt; negative transit time is clamped to zero.');
  const apparentAge = receipt !== null && date !== null ? Math.max(0, (receipt - date) / 1000) : 0;
  let ageValue = 0;
  if (Object.hasOwn(headers, 'age')) {
    const ages = headers.age.split(',').map(item => delta(item.trim()));
    // RFC 9111 §5.1 specifies the first value for a list. Flag ambiguity rather than silently losing it.
    if (ages.length > 1) { warnings.push('Repeated Age values are ambiguous; validation is required conservatively.'); malformed = true; }
    if (ages[0] === null) { warnings.push('Age is invalid; validation is required conservatively.'); malformed = true; }
    else ageValue = ages[0];
  }
  const baseAge = Math.min(MAX_SECONDS, Math.max(apparentAge, addSeconds(ageValue, delay)));
  const currentAge = addSeconds(baseAge, elapsed);
  if (settings.responseTime === null) notes.push(date === null
    ? 'Capture time is absent; apparent age and transit are assumed zero. No system clock is consulted.'
    : settings.requestTime === null
      ? 'Capture times are absent; the response Date is assumed to be receipt, with zero transit.'
      : 'Response capture time is absent; the response Date is assumed to be receipt.');

  let freshnessLifetime = null;
  let freshnessSource = 'none';
  const chosen = shared && has('s-maxage') ? 's-maxage' : has('max-age') ? 'max-age' : null;
  if (chosen) {
    freshnessSource = chosen;
    freshnessLifetime = seconds.get(chosen) ?? 0;
  } else if (Object.hasOwn(headers, 'expires')) {
    freshnessSource = 'expires';
    const expires = httpDate(headers.expires, referenceYear ?? (date === null ? null : new Date(date).getUTCFullYear()));
    if (expires === null) {
      freshnessLifetime = 0;
      malformed = true;
      warnings.push('Expires is invalid or repeated; the response is treated as stale.');
    } else if (date !== null || receipt !== null) freshnessLifetime = Math.min(MAX_SECONDS, Math.max(0, (expires - (date ?? receipt)) / 1000));
    else warnings.push('Expires needs a valid Date or responseTime; its freshness lifetime is unknown.');
  }
  if (chosen && Object.hasOwn(headers, 'expires')) notes.push(`${chosen} overrides Expires.`);
  if (!shared && has('s-maxage')) notes.push('s-maxage applies only to shared caches and does not set private-cache freshness.');
  if (freshnessLifetime === null) notes.push('No determinate explicit freshness lifetime. Heuristic freshness is not calculated.');

  let validator = null;
  if (headers.etag) {
    if (/^(?:W\/)?"[\x21\x23-\x7e\u0080-\u00ff]*"$/.test(headers.etag)) validator = 'etag';
    else warnings.push('ETag is invalid or repeated and cannot be used as a validator.');
  }
  if (headers['last-modified']) {
    if (httpDate(headers['last-modified'], referenceYear) !== null) validator ??= 'last-modified';
    else warnings.push('Last-Modified is invalid or repeated and cannot be used as a validator.');
  }
  if (headers.etag && headers['last-modified'] && validator === 'etag') notes.push('ETag is the preferred validator (If-None-Match); Last-Modified may also be sent for compatibility.');
  const vary = [...new Set((headers.vary ?? '').split(',').map(name => name.trim().toLowerCase()).filter(Boolean))];
  const invalidVary = vary.some(name => name !== '*' && !TOKEN.test(name));
  if (invalidVary) warnings.push('Vary contains an invalid field name; this stored response cannot be selected safely.');
  if (vary.length && !vary.includes('*')) notes.push(`Reuse requires matching request headers named by Vary: ${vary.join(', ')}.`);

  const staleWhileRevalidate = seconds.get('stale-while-revalidate') ?? 0;
  const staleIfError = seconds.get('stale-if-error') ?? 0;
  const blockingStale = has('no-cache') || has('must-revalidate') || (shared && (has('proxy-revalidate') || has('s-maxage'))) || malformed;
  if (blockingStale && (staleWhileRevalidate > 0 || staleIfError > 0)) warnings.push('An applicable revalidation restriction or malformed policy blocks stale extensions conservatively.');
  if (shared && has('s-maxage')) notes.push('s-maxage also requires shared-cache revalidation once stale.');
  if (authenticated && shared) notes.push('Authenticated shared caching requires public, must-revalidate, or valid s-maxage.');
  const authPermission = has('public') && value('public') === null || has('must-revalidate') && value('must-revalidate') === null || has('s-maxage') && seconds.has('s-maxage');
  const storeAllowed = !has('no-store') && !(shared && has('private')) && !(shared && authenticated && !authPermission);

  const result = { headers, directives, cacheType, baseAge, currentAge, freshnessLifetime, freshnessSource,
    staleWhileRevalidate, staleIfError, storeAllowed, state: 'unknown', label: 'Unknown freshness',
    reason: 'No explicit freshness lifetime can be determined; this model does not invent a heuristic TTL.',
    action: 'unknown', validator, warnings, notes, blockingStale, vary };
  function decision(state, label, action, reason) { Object.assign(result, { state, label, action, reason }); return result; }
  function needOrigin(reason) {
    if (originError) return decision('blocked', 'Origin required', 'error', `${reason} The origin failed, and stale reuse is not permitted.`);
    return validator
      ? decision('revalidate', 'Validate before reuse', 'validate', `${reason} Send a conditional request using ${validator === 'etag' ? 'If-None-Match' : 'If-Modified-Since'}.`)
      : decision('fetch', 'Fetch from origin', 'fetch', `${reason} No usable validator is available; fetch a full response.`);
  }
  if (!storeAllowed) return originError
    ? decision('blocked', 'Storage prohibited', 'error', 'This response cannot be stored by this cache, and the origin failed.')
    : decision('fetch', 'Do not store', 'fetch', has('no-store') ? 'no-store prohibits storing and reusing this response.'
      : shared && has('private') ? 'private prohibits storing this complete response in a shared cache.'
        : 'A response to an authenticated request needs explicit permission for shared caching.');
  if (vary.includes('*') || invalidVary || (vary.length > 0 && !varyMatches)) return originError
    ? decision('blocked', 'No matching variant', 'error', 'The stored Vary variant cannot satisfy this request, and the origin failed.')
    : decision('fetch', 'Fetch matching variant', 'fetch', 'The stored response does not match Vary; request a representation for the current request headers.');
  if (malformed) return needOrigin('The cache policy or age information is malformed or ambiguous.');
  if (has('no-cache')) return needOrigin('no-cache permits storage but requires successful validation before every reuse.');
  if (freshnessLifetime === null) return result;
  if (currentAge < freshnessLifetime) return decision('fresh', 'Fresh cache hit', 'cache', `Current age (${currentAge}s) is below the ${freshnessSource} freshness lifetime (${freshnessLifetime}s).`);
  const staleness = currentAge - freshnessLifetime;
  if (!blockingStale && originError && staleIfError > 0 && staleness <= staleIfError) return decision('sie', 'Stale on origin error', 'cache', `The origin failed and staleness (${staleness}s) is within the stale-if-error allowance (${staleIfError}s).`);
  if (!blockingStale && staleWhileRevalidate > 0 && staleness < staleWhileRevalidate) return decision('swr', 'Stale while validating', 'background-validation', `Staleness (${staleness}s) is inside the stale-while-revalidate window (${staleWhileRevalidate}s); serve stale while attempting background validation.`);
  return needOrigin(blockingStale ? 'The response is stale and an applicable directive forbids stale reuse.' : 'The response is stale and outside any permitted stale window.');
}
