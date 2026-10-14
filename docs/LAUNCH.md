# FreshTrace release positioning

The [repository](https://github.com/qsxustc/freshtrace), [live lab](https://qsxustc.github.io/freshtrace/), and [v0.1.0 GitHub Release](https://github.com/qsxustc/freshtrace/releases/tag/v0.1.0) are public. This file contains launch copy and instructions for subsequent releases. The project has not been published to npm.

**[Download v0.1.0 full package](https://github.com/qsxustc/freshtrace/releases/download/v0.1.0/freshtrace-v0.1.0.zip)** · [SHA-256 checksums](https://github.com/qsxustc/freshtrace/releases/download/v0.1.0/SHA256SUMS.txt)

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

Verified homepage: [https://qsxustc.github.io/freshtrace/](https://qsxustc.github.io/freshtrace/). The release and CI results are linked directly in the README.

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

> [Try FreshTrace](https://qsxustc.github.io/freshtrace/) · [GitHub](https://github.com/qsxustc/freshtrace) · [Download v0.1.0](https://github.com/qsxustc/freshtrace/releases/tag/v0.1.0)

Local usage is `npm start` from the extracted package or repository; there is no npm registry install command.

## 中文发布文案草稿

> 做了一个 FreshTrace，把 HTTP 缓存头变成可以拖动的时间线。
>
> 粘贴响应头，就能分别查看浏览器和共享缓存的新鲜期、已有 Age 的影响、验证要求，以及支持的过期复用窗口。还可以放入第二套策略，在改配置前比较差异。分析在本地完成，无运行时第三方依赖，附带共用同一个引擎的 CLI。
>
> 模型假设和限制都有文档。欢迎提交最小响应头案例，以及附有 RFC 来源的语义修正。

> [在线体验](https://qsxustc.github.io/freshtrace/) · [GitHub 仓库](https://github.com/qsxustc/freshtrace) · [下载 v0.1.0](https://github.com/qsxustc/freshtrace/releases/tag/v0.1.0)

## Related projects and fair comparisons

- [http-cache-semantics](https://github.com/kornelski/http-cache-semantics) supplies a programmatic HTTP cache policy library. FreshTrace emphasizes visualization and explanations.
- [best-before](https://github.com/expo/best-before) applies HTTP caching semantics to the Web Cache API. FreshTrace evaluates a scenario without handling actual requests.
- [HTTP Cache Playground](https://github.com/hilverd/http-cache-playground) runs experiments with Varnish. FreshTrace uses an offline private/shared model without a cache server.

Describe the different jobs these projects do. Avoid “first,” “only,” “more correct,” or blanket performance claims without evidence. Stars measure interest, not correctness; no launch plan can guarantee them.

## Prepare subsequent releases

The v0.1.0 release is published. Before publishing a subsequent tagged release:

1. Run `npm test`, `npm run build`, and `npm run package:release` from the intended release revision.
2. Open the generated static build, check both desktop and narrow layouts, and verify scenario import/export and report output.
3. Inspect `release/freshtrace-v0.1.0.zip` and confirm it contains only intended distributable files. Keep real captures and secrets out of it.
4. Check that README commands, version, model boundaries, and screenshot match the release.
5. Create release notes that distinguish shipped features, known limits, and future ideas.
6. If deploying Pages, configure the repository's Pages source as GitHub Actions and verify the deployed URL before linking it. GitHub's [custom workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) describes the setup.

The repository is currently configured as a private npm package to prevent accidental registry publication. GitHub source and a release archive are independent of npm publication.

## Publish a GitHub Release

The v0.1.0 package and checksum were published by the [successful release workflow](https://github.com/qsxustc/freshtrace/actions/runs/38577303096). All 37 source files in the downloaded package match the immutable version tag, and all 12 static build files match their corresponding source files. The archive retains the tagged documentation; the publishing workflow and updated launch links live on `main`.

The [Publish release workflow](../.github/workflows/release.yml) tests and packages an existing version tag, generates `SHA256SUMS.txt`, uploads both files to a draft, and publishes the release after checking that the checksum matches the uploaded ZIP. It checks out the tag explicitly and requires its name to match `package.json`.

For an existing tag such as `v0.1.0`, open **Actions → Publish release → Run workflow**, select the `main` branch for the workflow definition, and enter the tag. For subsequent versions, prepare the package version, CLI version, and `docs/releases/vX.Y.Z.md` together, commit them, then push the version tag. A pushed `v*` tag runs the same workflow automatically.

Repeating a run preserves existing assets and checks their consistency. A missing checksum is calculated from the uploaded ZIP rather than a rebuilt file. If only a checksum exists and the new ZIP does not match, the workflow fails with the existing asset intact. Packaging timestamps can make separate builds of the same source produce different ZIP hashes.

After downloading both release assets into the same directory, verify them before extracting:

```sh
# macOS
shasum -a 256 -c SHA256SUMS.txt
# Linux
sha256sum -c SHA256SUMS.txt
```

A successful check prints `freshtrace-v0.1.0.zip: OK`. Use the checksum attached to the published release rather than one from a local rebuild.

## Possible later work

These are ideas for discussion, not promises or shipped capabilities: request-side policy analysis; a captured-request Vary comparator; provider-specific adapters with explicit settings; a live capture import workflow; and more teaching scenarios. Preserve a useful, trustworthy small model before broadening it.
