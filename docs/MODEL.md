# FreshTrace v0.1 model

FreshTrace asks: **under the supplied scenario, what can this cached response do now?** It evaluates policy and timing, then explains the result. It does not observe a running cache or measure whether a request actually hit one.

The browser and CLI call the same pure ESM engine, `src/cache.js`. Identical inputs and options yield the same result; no system clock, network call, or random value is part of the analysis.

## Response and request assumptions

The model starts with one complete GET response with status 200. It assumes that the new request addresses the same URL, the stored representation has not changed, and the cache still has that representation. It does not simulate eviction, a successful 304 response, a subsequent refresh, an unsafe-method invalidation, or a stream of requests.

The **private** mode represents a cache dedicated to one user. The **shared** mode represents a cache that can reuse responses across users. The labels “Browser” and “Shared / CDN” in the interface are helpful examples of these roles, not predictions about every implementation.

Options supplied by the scenario:

| Option | Default | Meaning |
| --- | --- | --- |
| `elapsed` | `0` | Nonnegative seconds since response receipt |
| `cacheType` | `private` | `private` or `shared`; the UI and CLI can run both |
| `originError` | `false` | A qualifying origin failure is occurring now |
| `authenticated` | `false` | The original request carried `Authorization` |
| `varyMatches` | `true` | The new request matches the stored response's nominated Vary fields |
| `requestTime` / `responseTime` | absent | Optional original capture clocks, as ISO timestamps or epoch milliseconds in the engine API |

`authenticated` is a boolean assumption; FreshTrace does not need the credential itself. `varyMatches` is also supplied, rather than inferred from request header captures. `Vary: *` prevents matching regardless of that option.

## Supported input

Use a response header block or an object whose keys are header names. Names are normalized without case sensitivity. Header-only inputs assume status 200. If a pasted block includes an HTTP status line, only status 200 is accepted; non-200 lines are rejected. The tool does not simulate redirects, 404 responses, or 304 validation responses. Supply one final response block, rather than a concatenation of redirects, interim responses, and the final response.

The engine considers `Cache-Control`, `Age`, `Date`, `Expires`, `ETag`, `Last-Modified`, and `Vary`. Other fields may remain in the normalized input or report but are not a provider-specific policy model. Unknown directives are not treated as an instruction to permit caching.

A plain JSON header object is valid CLI input. Browser scenario JSON is a separate format for restoring policies and interface options; do not use a scenario file as a header object.

## Clocks and age

FreshTrace intentionally avoids guessing a capture time from “now.”

With both capture clocks supplied, the engine uses:

```text
apparent age = max(0, response receipt time − Date)
response delay = response receipt time − original request time
base age = max(apparent age, Age + response delay)
current age = base age + elapsed
```

Times in the calculation are seconds. Missing `Age` contributes zero. When both capture times are supplied, a request time later than the receipt time is invalid input. If receipt is inferred from the origin's `Date`, a negative inferred transit time is clamped to zero with a warning because the origin and capture clocks may differ. The engine accepts fractional elapsed seconds.

Without capture clocks, a valid response `Date` is treated as both original request and receipt time. That deliberately assumes zero transit delay and zero apparent age; the supplied `Age` still counts. If `Date` is absent, the engine still uses `Age` for a `max-age` policy but cannot derive an absolute `Expires` lifetime without `responseTime`. A supplied receipt time without a request time assumes zero transit delay.

This is a simplified capture default, not a claim that real packets travel instantly. For captured production headers, provide the actual original request and receipt timestamps when available. The calculation follows the structure described in [RFC 9111 §4.2.3](https://httpwg.org/specs/rfc9111.html#calculating.age).

## Freshness and reuse

Explicit freshness comes from `s-maxage` for shared caches when present, otherwise `max-age`, otherwise a valid `Expires` lifetime. FreshTrace does not synthesize heuristic freshness from `Last-Modified` or a status code. The absence of explicit freshness produces an unknown TTL, not proof that a response cannot be stored.

A response is fresh when `currentAge < freshnessLifetime`. At exactly the lifetime boundary, it is stale. Reported stale windows are measured from that boundary, rather than from receipt.

Storage permission is evaluated separately from permission to reuse the response. The output includes both `storeAllowed` and the current decision. The main rules are grounded in [RFC 9111 §3](https://httpwg.org/specs/rfc9111.html#response.cacheability), [§4](https://httpwg.org/specs/rfc9111.html#constructing.responses.from.caches), and [§5.2.2](https://httpwg.org/specs/rfc9111.html#cache-response-directive).

## Deliberate conservative choices

| Input | FreshTrace behavior |
| --- | --- |
| `no-store` | Does not permit storage |
| `no-cache` | Requires validation before reuse, even during a nominal fresh period |
| Qualified `no-cache="field"` | Validates the whole response; selective field handling is outside v0.1 |
| `private` in shared mode | Does not permit shared storage |
| Qualified `private="field"` in shared mode | Blocks the whole response and warns; it does not simulate stripping fields |
| Malformed or duplicate recognized policy | Never returns an optimistic fresh result; disables modeled stale allowances and requires validation or a fetch |
| Conflicting directives | Uses the restrictive result and explains the conflict |
| Missing explicit TTL | Reports unknown freshness without inventing a duration |

These conservative choices are part of the product's model. Qualified directives can support narrower behavior in a cache that implements selective field processing, which this tool does not do. Repeated `Age` values use the first value for display but mark the input ambiguous. Invalid `Date` or `Age` also forces validation or a fetch. Numeric overflow is saturated at `Number.MAX_SAFE_INTEGER` to keep calculations finite.

HTTP dates in IMF-fixdate and asctime form are supported. Obsolete RFC 850 dates use a two-digit year; they require an explicit response capture time to anchor century interpretation. Without that anchor they are treated as ambiguous. ISO capture timestamps must include a timezone and a valid calendar date.

`immutable` is explained, but FreshTrace does not simulate reloads or browser-specific navigation behavior.

## Stale-serving windows

The model includes the two response extensions defined by [RFC 5861](https://httpwg.org/specs/rfc5861.html):

- `stale-while-revalidate=N` supplies a modeled opportunity to serve a stale response while validating in the background.
- `stale-if-error=N` supplies a modeled opportunity to reuse a stale response during a qualifying origin failure, when the `originError` option is enabled.

The scenario represents an error compatible with the extension, such as a 500, 502, 503, or 504 outcome; it does not interpret an arbitrary status code. FreshTrace treats `must-revalidate`, and in shared mode `proxy-revalidate` or `s-maxage`, as blockers of stale reuse. A stricter policy therefore can suppress an otherwise visible stale window. `no-cache` also requires validation before reuse.

The stale-while-revalidate window uses an exclusive upper boundary; stale-if-error permits the exact maximum staleness boundary. For example, a 60-second freshness lifetime and 30-second allowance give SWR at age 89 but not 90, and SIE at age 90 but not 91 when the origin-error condition holds.

The windows show permission in this model. They do not schedule a refresh and do not guarantee that a browser or CDN supports or chooses that extension. Moving the elapsed-time slider does not reset response age through a simulated successful validation.

## Authentication and variants

Shared-cache behavior changes when the original request was authenticated. The engine checks permission from `public`, `s-maxage`, or `must-revalidate`, then evaluates the remaining restrictions. `public` does not cancel `no-store` or make an unmatched variant reusable. See [RFC 9111 §3.5](https://httpwg.org/specs/rfc9111.html#caching.authenticated.responses).

A supplied Vary mismatch requires another representation. `Vary: *` always fails to match. FreshTrace does not derive a real cache key or compare individual request headers; see [RFC 9111 §4.1](https://httpwg.org/specs/rfc9111.html#caching.negotiated.responses) for that mechanism.

## Outside v0.1

Request-side `Cache-Control`, provider overrides such as `CDN-Cache-Control` or `Surrogate-Control`, cache configuration, Service Workers, browser back/forward caches, partial responses, non-GET methods, other response statuses, eviction, invalidation, redirects, and live URL fetching are outside this release. `Set-Cookie` does not activate a provider-specific bypass rule in this model.

An actual CDN can add restrictions or override origin policy through its configuration. Confirm the implementation and settings of your deployment when checking production behavior.

## Reporting a disagreement

Share a minimized synthetic header block, all scenario options, the expected result, and a primary-source reference. For a provider-specific result, identify the provider and relevant settings. See [CONTRIBUTING.md](../CONTRIBUTING.md) and [SECURITY.md](../SECURITY.md) before sharing a capture.
