# FreshTrace promotion log

This log distinguishes work actually submitted from possible future channels. Project links: [lab](https://qsxustc.github.io/freshtrace/), [source](https://github.com/qsxustc/freshtrace), [release](https://github.com/qsxustc/freshtrace/releases/tag/v0.1.0).

## First campaign — 2026-10-14

The starting public star count was 0, observed on GitHub before these submissions. No increase in stars or traffic is claimed by this log. The app has no analytics.

### Submitted to relevant tool directories

| Directory | Public submission | Status at submission |
| --- | --- | --- |
| awesome-wpo | [PR #307](https://github.com/davidsonfellipe/awesome-wpo/pull/307) | Open; awaiting maintainer review |
| awesome-web-performance | [PR #68](https://github.com/d4rkr00t/awesome-web-performance/pull/68) | Open; awaiting maintainer review |

Each contribution adds one line to the existing Analyzers section. The description links directly to the working demo, describes the offline HTTP cache-policy model, and avoids popularity or vendor-compatibility claims. Both PR descriptions disclose project maintenance and AI assistance. No additional promotional issues or duplicate follow-up comments were sent.

For awesome-wpo, the [contribution guide](https://github.com/davidsonfellipe/awesome-wpo/blob/main/contributing.md) permits tool PRs and asks for awesome-lint. Its package script is actually named `lint-awesome`. Running `npm run lint-awesome` reported 33 errors; the untouched upstream README reported the same 33 errors. No error referred to the new FreshTrace entry. This result is disclosed in the PR rather than reported as a passing lint run.

For awesome-web-performance, `markdown-toc-gen@1.0.1 insert README.md` was run, matching the version used by the repository's TOC script. The TOC was unchanged; the diff remains a single added entry. `git diff --check` passed.

### Search and sharing entry points

- [Four HTTP cache questions](https://qsxustc.github.io/freshtrace/learn/) explains browser/shared freshness, existing Age, validation versus storage, and stale windows, with RFC sources and reproducible model examples.
- The main app and both READMEs link to the guide. The guide links to the lab, public source, and release.
- Both pages have canonical URLs and Open Graph/Twitter metadata with a [1200 × 630 sharing card](https://qsxustc.github.io/freshtrace/assets/social-card.jpg). The original vector artwork is tracked in `assets/social-card.svg`.
- [sitemap.xml](https://qsxustc.github.io/freshtrace/sitemap.xml) lists the lab and guide. A project-path `robots.txt` is included for source distribution, but search crawlers use the host-root robots file. It does **not** submit the sitemap or prove indexing. No Search Console submission or search indexing is claimed. See [Google's robots.txt location guidance](https://developers.google.com/crawling/docs/robots-txt/create-robots-txt).

The shipped examples were checked against the actual analysis engine. Desktop and 390-pixel layouts were checked in a browser without page-wide horizontal overflow. The 42-test suite and static build passed. New static files are explicitly included in the build and local preview whitelist.

### Channels researched but not posted to

- [Hacker News guidelines](https://news.ycombinator.com/newsguidelines.html) prohibit generated text and automated posting. No HN title, body, or comment was generated for submission; no post was sent.
- [DEV's AI-content rules](https://dev.to/guidelines-for-ai-assisted-articles-on-dev) restrict AI-assisted promotion of a program and brand/clout-building, and prohibit AI-generated comments. No DEV promotion was published.
- [r/devops weekly self-promotion thread](https://www.reddit.com/r/devops/comments/1x3ujiw/weekly_self_promotion_thread/) was identified as a possible venue. It was not posted to. Before any future submission, inspect current subreddit/thread rules and use an authorized logged-in account.
- OpenAlternative and AlternativeTo were considered; no paid plan, paid review, account creation, or submission was made.

## Evaluate the campaign

Check the two public PRs for maintainer questions or acceptance. An open PR is a submitted recommendation, not a directory listing. Address actionable feedback without duplicate requests. Judge incoming interest through concrete issues, reproducible header cases, or volunteered feedback, alongside the public star count. Without analytics, do not invent visit counts or conversion rates.

Future updates to this log should record evidence and dates. No recurring monitor or follow-up automation was created by this campaign.
