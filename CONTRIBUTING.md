# Contributing to FreshTrace

FreshTrace aims to make HTTP caching decisions easier to inspect without hiding assumptions. The most useful contributions are small, reproducible examples that improve correctness or understanding.

## Run the project

Use Node.js 20 or later. There are no runtime dependencies to install.

```sh
npm start
npm test
npm run build
```

The browser app and CLI share `src/cache.js`. [docs/API-CONTRACT.md](docs/API-CONTRACT.md) describes its interface; [docs/MODEL.md](docs/MODEL.md) describes the analysis boundaries.

## Report an incorrect decision

Include the smallest header block that reproduces the result, the scenario options, what FreshTrace showed, what you expected, and a primary source supporting the expectation. A link to the relevant RFC section is especially helpful. Remove private header values first.

If the difference occurs only with a particular browser or CDN configuration, include that context. It might be an implementation-specific behavior outside the current model rather than an engine defect.

## Make a change

1. Keep a pull request focused on one behavior or improvement.
2. For engine changes, add a regression case that fails before the correction. Cover the private and shared cache models when their rules differ.
3. Check both sides of a time boundary, including the exact expiry point. Add malformed-input cases when a parser changes.
4. Update model documentation and both READMEs if supported behavior or usage changes.
5. Run the tests and build. For UI changes, also check keyboard access, narrow screens, text contrast, and that explanations remain visible.

Prefer explicit, deterministic calculations to hidden clocks or heuristics. Keep user data local. Add a dependency only when its benefit outweighs the loss of the simple offline setup, and explain that tradeoff in the pull request.

Avoid weakening conservative handling just to match an optimistic example. If an ambiguous policy must be treated differently, explain why and attach a source or test case.

## Tests that help

- A directive changing the decision under a specific scenario.
- An age or freshness calculation with known capture timestamps.
- A malformed header that must not become an optimistic cache hit.
- CLI behavior for stdin, invalid flags, file handling, or output safety.

Tests that repeat implementation details without asserting user-visible behavior are less useful.

## Documentation and translations

Use plain language and concrete headers. Keep distinctions such as storage versus reuse, private versus shared caching, and permission versus guaranteed behavior clear. English and Simplified Chinese READMEs should describe the same shipped features. Preserve header names, option names, and code examples across translations.

By submitting a contribution, you agree to license it under the repository's [MIT license](LICENSE).
