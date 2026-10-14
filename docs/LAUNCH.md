# FreshTrace release positioning

This file contains preparation notes and copy for a release. It does not claim that a public repository, npm package, or hosted demo already exists.

## Positioning

**One sentence:** FreshTrace turns HTTP cache headers into an interactive timeline you can compare, explain, and inspect offline.

**Problem:** A single header can produce different behavior in a browser and a shared cache. Existing `Age`, authentication, variant matching, and stale-serving rules make a TTL alone an incomplete explanation.

**Audience:** Frontend engineers checking asset policy, API developers reviewing response headers, platform teams discussing CDN freshness, and developers learning HTTP caching.

**Hook:** “How long is this response fresh—for the browser, and for the CDN?” Paste headers and answer that question visually, then change one directive and compare the result.

**Product boundary:** A deterministic standards-based model with stated assumptions. It is neither a live CDN debugger nor a compliance claim for all caches.

## Suggested repository metadata

Description:

> See what your HTTP cache headers mean over time. Offline browser lab + zero-dependency CLI with private/shared timelines and A/B policy comparison.

Possible topics:

`http`, `http-caching`, `cache-control`, `cdn`, `developer-tools`, `visualization`, `offline`, `javascript`, `cli`, `web-performance`

Set a homepage only after a real demo URL has been confirmed. Add CI or release badges only when their backing workflow and release exist.

## Short demo sequence

Record the actual shipped interface with synthetic headers:

1. Paste `Cache-Control: public, max-age=60, stale-while-revalidate=120`, `Age: 45`, and `ETag: "catalog-v3"`.
2. Point out the 15 seconds of remaining freshness. Move elapsed time to 30 seconds and show the stale-while-revalidate decision.
3. Copy the policy to B and add `s-maxage=300`. Show the private/shared divergence and the explanation of the stricter shared stale rule.
4. Try a policy with `stale-if-error=300`, then toggle origin failure after the fresh period.
5. Export a scenario or Markdown report and show the CLI reading the same header block.

Keep the recording focused on one question at a time. The explanation is part of the hook; do not crop away assumptions or warning messages to make a result look cleaner.

## English announcement draft

> I built FreshTrace because “max-age is 60” does not tell the whole caching story.
>
> Paste response headers and move through time to see private/shared cache decisions, existing Age, validation, and supported stale windows. Compare two policies before changing a configuration. It runs locally, has no runtime dependencies, and includes a CLI using the same engine.
>
> The model and its limits are documented. Minimal header cases and corrections with RFC references are welcome.

Append verified repository and demo links when publishing. Do not imply a public deployment or an npm install command before it exists.

## 中文发布文案草稿

> 做了一个 FreshTrace，把 HTTP 缓存头变成可以拖动的时间线。
>
> 粘贴响应头，就能分别查看浏览器和共享缓存的新鲜期、已有 Age 的影响、验证要求，以及支持的过期复用窗口。还可以放入第二套策略，在改配置前比较差异。分析在本地完成，无运行时第三方依赖，附带共用同一个引擎的 CLI。
>
> 模型假设和限制都有文档。欢迎提交最小响应头案例，以及附有 RFC 来源的语义修正。

发布时补充已经验证的仓库和演示链接。

## Related projects and fair comparisons

- [http-cache-semantics](https://github.com/kornelski/http-cache-semantics) supplies a programmatic HTTP cache policy library. FreshTrace emphasizes visualization and explanations.
- [best-before](https://github.com/expo/best-before) applies HTTP caching semantics to the Web Cache API. FreshTrace evaluates a scenario without handling actual requests.
- [HTTP Cache Playground](https://github.com/hilverd/http-cache-playground) runs experiments with Varnish. FreshTrace uses an offline private/shared model without a cache server.

Describe the different jobs these projects do. Avoid “first,” “only,” “more correct,” or blanket performance claims without evidence. Stars measure interest, not correctness; no launch plan can guarantee them.

## Release preparation

Before publishing a tagged release:

1. Run `npm test`, `npm run build`, and `npm run package:release` from the intended release revision.
2. Open the generated static build, check both desktop and narrow layouts, and verify scenario import/export and report output.
3. Inspect `release/freshtrace-v0.1.0.zip` and confirm it contains only intended distributable files. Keep real captures and secrets out of it.
4. Check that README commands, version, model boundaries, and screenshot match the release.
5. Create release notes that distinguish shipped features, known limits, and future ideas.
6. If deploying Pages, configure the repository's Pages source as GitHub Actions and verify the deployed URL before linking it. GitHub's [custom workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) describes the setup.

The repository is currently configured as a private npm package to prevent accidental registry publication. GitHub source and a release archive are independent of npm publication.

## Possible later work

These are ideas for discussion, not promises or shipped capabilities: request-side policy analysis; a captured-request Vary comparator; provider-specific adapters with explicit settings; a live capture import workflow; and more teaching scenarios. Preserve a useful, trustworthy small model before broadening it.
