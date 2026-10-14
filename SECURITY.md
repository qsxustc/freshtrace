# Security and data handling

FreshTrace processes supplied response headers locally. It does not contact a URL to inspect it, forward headers to an analysis service, load analytics, or need an API key. The development server binds to loopback by default.

## What can contain private data

Header blocks may include cookies, tokens, internal hostnames, user identifiers, or application metadata. Scenario JSON and CLI JSON include supplied headers. Markdown reports omit the full block, but warnings can contain input-derived snippets. Treat exports with the same care as the original input. Remove private values before posting a report, issue, screenshot, or scenario.

The tool is not a secret sanitizer. A locally processed input is not automatically safe to share.

The browser uses the local application files; a publicly hosted copy still involves its hosting provider serving those files. Inspect the source or run the repository locally if you need to control that distribution path.

## Model boundaries

FreshTrace evaluates a stated caching model. It does not certify that private content is protected by an actual deployment, verify CDN overrides, or test cache keys at a running service. Use a real request capture and deployment-specific checks when validating production behavior.

Malformed or ambiguous cache policy should generate a conservative result. A case that incorrectly permits storing or reusing a response is a correctness concern and may also be security relevant.

## Report a vulnerability

For a problem involving data disclosure, unsafe rendering, unexpected outbound requests, or local file handling, use the repository's **Security → Report a vulnerability** entry if the maintainer has enabled private vulnerability reporting. Do not include live credentials or private headers in a public issue.

If private reporting is unavailable, open a minimal public issue that asks for a private reporting channel without publishing exploit details or sensitive data. There is no dedicated security email address established by this repository and no guaranteed response time.

For a non-sensitive model correction, the regular bug-report template is appropriate. Include a minimized, synthetic header block and relevant scenario options.
