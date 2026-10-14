# FreshTrace

**See what your HTTP cache headers mean—over time.**

[简体中文](README.zh-CN.md) · [Model & assumptions](docs/MODEL.md) · [Contributing](CONTRIBUTING.md)

**[Try the public lab](https://qsxustc.github.io/freshtrace/)** · **[Download v0.1.0 package](https://github.com/qsxustc/freshtrace/releases/download/v0.1.0/freshtrace-v0.1.0.zip)** · [SHA-256 checksums](https://github.com/qsxustc/freshtrace/releases/download/v0.1.0/SHA256SUMS.txt)

[Release notes](https://github.com/qsxustc/freshtrace/releases/tag/v0.1.0) · [Tagged source archive](https://github.com/qsxustc/freshtrace/archive/refs/tags/v0.1.0.zip)

[Four HTTP cache questions, explained](https://qsxustc.github.io/freshtrace/learn/): max-age vs s-maxage, existing Age, no-cache vs no-store, and stale windows, with small reproducible examples.

Paste response headers. Move through time. See when a browser or shared cache can reuse a response, needs to validate it, or has to contact the origin. Then compare a second policy before changing your configuration.

FreshTrace is an offline HTTP cache policy lab with a browser interface and a command-line tool. Both use the same deterministic analysis engine. No account, API key, AI model, or runtime dependencies are required.

![FreshTrace workbench comparing browser and shared-cache policy timelines](docs/images/workbench.jpg)

```http
Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=120
ETag: "catalog-v3"
Age: 45
```

The response is already 45 seconds old. A private cache has 15 seconds of freshness left; a shared cache has 255 seconds left. The two caches can make different decisions for the same headers.

## Try it locally

The published package contains the tagged source, CLI, documentation, and a static browser build in `dist/`. Download the ZIP and checksum file into the same directory, then verify the package before extracting it:

```sh
# macOS
shasum -a 256 -c SHA256SUMS.txt
# Linux
sha256sum -c SHA256SUMS.txt
```

A successful check prints `freshtrace-v0.1.0.zip: OK`. Extract the package and open the `freshtrace-v0.1.0` directory, or clone the repository. Use Node.js 20 or later:

```sh
npm start
```

Open the loopback URL printed in the terminal, normally `http://127.0.0.1:4174`. There is no install step. The server serves local app files; analysis runs in your browser.

1. Load a preset or paste a response header block into policy A.
2. Adjust elapsed time to follow the response from fresh to stale.
3. Compare the private-cache and shared-cache decisions and read the reason for each.
4. Toggle origin failure, an authenticated request, or a Vary mismatch to inspect the effect.
5. Enter policy B to compare a proposed change. Download a JSON scenario to revisit it later, or export a Markdown report.

## What you can inspect

| Question | FreshTrace shows |
| --- | --- |
| Why does the CDN stay fresh longer than the browser? | Separate freshness lifetimes from `max-age` and `s-maxage` |
| Does `no-cache` mean “do not store”? | Storage permission and validation requirements as separate decisions |
| What does an existing `Age` do? | Starting age, current age, and remaining freshness |
| What happens after the TTL? | Validation, fetch, and supported stale-serving windows |
| Can this response be reused during an origin error? | The modeled `stale-if-error` window and any blocking directive |
| Does authentication or `Vary` change the outcome? | Shared-cache permission and variant-match checks |
| What changes if I edit this header? | A/B policies evaluated under the same scenario |

The engine supports response directives including `no-store`, `no-cache`, `private`, `public`, `max-age`, `s-maxage`, `must-revalidate`, `proxy-revalidate`, `immutable`, `stale-while-revalidate`, and `stale-if-error`; it also considers `Age`, `Date`, `Expires`, `ETag`, `Last-Modified`, and `Vary`. Malformed or ambiguous policy produces warnings and conservative results.

## Command line

Analyze a header file or a JSON object whose keys are header names:

```sh
node bin/freshtrace.js samples/cdn-response.json --elapsed 30
node bin/freshtrace.js samples/origin-outage.json --elapsed 150 --origin-error
node bin/freshtrace.js samples/cdn-response.json --cache shared --format json
```

The first fixture shows private/shared cache divergence; the second shows stale reuse during an origin failure. In the browser, import [`samples/browser-vs-cdn.scenario.json`](samples/browser-vs-cdn.scenario.json) to load a complete A/B scenario.

Pipe a captured header block into the tool:

```sh
printf '%s\n' 'Cache-Control: max-age=60, stale-if-error=300' 'ETag: "v1"' \
  | node bin/freshtrace.js - --elapsed 120 --origin-error
```

Capture clocks are optional. Supplying them lets the engine account for apparent age and response delay:

```sh
node bin/freshtrace.js response-headers.txt \
  --requested-at 2026-10-14T08:00:00Z \
  --received-at 2026-10-14T08:00:02Z \
  --elapsed 90 --format markdown --output review.md
```

| Option | Meaning |
| --- | --- |
| `--elapsed <seconds>` | Time since the response was received; default `0` |
| `--cache private\|shared\|both` | Cache model; default `both` |
| `--origin-error` | Simulate a qualifying origin failure |
| `--authenticated` | Model an original request with an `Authorization` header |
| `--vary-mismatch` | Model a request that does not match the stored variant |
| `--requested-at <ISO>` / `--received-at <ISO>` | Original request and response capture times |
| `--format markdown\|json` | Output format; default `markdown` |
| `--output <path>` | Write a report to a file |
| `--force` | Allow replacing an existing output file |
| `--help` / `--version` | Show command help or version |

The CLI also accepts a single bare `Cache-Control` value, such as `public, max-age=60`. It reads local files or stdin and does not fetch URLs. Inputs are limited to 128 KiB. Existing output files require `--force`; input files cannot be overwritten.

Exit codes are `0` for a successfully produced report, `1` for input, analysis, or output failures, and `2` for invalid command arguments. A report containing a warning or a non-cacheable response still exits `0`; the CLI is an inspector, not a CI policy gate.

## Read the model before treating a result as a diagnosis

FreshTrace v0.1 evaluates one complete **GET 200** response, a matching URL, and an unchanged stored representation. It explains a standards-based model, rather than probing an actual cache. Cache configuration, implementation support, eviction, request headers, and provider overrides can change real behavior.

Header-only inputs assume status 200. If a pasted block includes an HTTP status line, it must be 200; other statuses are rejected.

Without capture clocks, a valid response `Date` is treated as the receipt time with zero transit delay. The engine never substitutes the machine's current time. It does not invent a heuristic TTL when explicit freshness is absent. See [the complete model](docs/MODEL.md) for supported inputs, conservative choices, and boundaries.

The analysis is grounded in [RFC 9111: HTTP Caching](https://httpwg.org/specs/rfc9111.html) and [RFC 5861: stale content extensions](https://httpwg.org/specs/rfc5861.html). FreshTrace is a learning and review tool; it is not a browser/CDN certification suite.

## Privacy

Header analysis stays in your browser or local CLI process. The app has no analytics, external fonts, or remote analysis service. Scenario JSON and CLI JSON include supplied headers. Markdown reports omit the full header block, but warnings can quote parts of the input. Review exports and remove private values before sharing them. See [SECURITY.md](SECURITY.md).

## Build and contribute

```sh
npm test
npm run build
npm run package:release
```

The static build is written to `dist/`. Packaging requires the system `zip` command and writes `release/freshtrace-v0.1.0.zip`; use `npm run package:release -- --force` to replace an existing archive. Serve the static build with a static server or deploy it to static hosting. The included Pages workflow deploys the public lab through GitHub Actions.

The [public lab](https://qsxustc.github.io/freshtrace/) is deployed through GitHub Pages. The release commit passed the 42-test suite in [Node.js 20, 22, and 24 CI](https://github.com/qsxustc/freshtrace/actions/runs/38573617461) and [the Pages deployment](https://github.com/qsxustc/freshtrace/actions/runs/38573617610). The [published v0.1.0 release](https://github.com/qsxustc/freshtrace/releases/tag/v0.1.0) was built from its immutable tag by the [release workflow](https://github.com/qsxustc/freshtrace/actions/runs/38577303096); all 37 packaged source files match that tag and the 12 static build files match their source. Packaging timestamps can change ZIP checksums between builds, so use the checksum attached to the release when verifying a download.

Useful contributions include minimal header cases, corrections backed by a primary source, clearer decision explanations, and accessibility improvements. Start with [CONTRIBUTING.md](CONTRIBUTING.md).

## Related projects

| Project | Focus | How FreshTrace fits alongside it |
| --- | --- | --- |
| [http-cache-semantics](https://github.com/kornelski/http-cache-semantics) | JavaScript cacheability and revalidation library | FreshTrace is an interactive explanation and policy-comparison interface |
| [best-before](https://github.com/expo/best-before) | HTTP caching semantics on the Web Cache API | FreshTrace simulates decisions without intercepting or making requests |
| [HTTP Cache Playground](https://github.com/hilverd/http-cache-playground) | Experiments with Varnish and HTTP headers | FreshTrace needs no cache server and compares a private/shared model offline |

These projects are independent. FreshTrace is implemented here and does not bundle their code.

## License

MIT © 2026 Songxin Qu. See [LICENSE](LICENSE).
