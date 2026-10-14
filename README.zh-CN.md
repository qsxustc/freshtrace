# FreshTrace

**把 HTTP 缓存头变成看得懂的时间线。**

[English](README.md) · [模型与假设](docs/MODEL.md) · [参与贡献](CONTRIBUTING.md)

**[直接体验在线工具](https://qsxustc.github.io/freshtrace/)** · **[下载 v0.1.0 完整包](https://github.com/qsxustc/freshtrace/releases/download/v0.1.0/freshtrace-v0.1.0.zip)** · [SHA-256 校验文件](https://github.com/qsxustc/freshtrace/releases/download/v0.1.0/SHA256SUMS.txt)

[正式发布说明](https://github.com/qsxustc/freshtrace/releases/tag/v0.1.0) · [标签源码压缩包](https://github.com/qsxustc/freshtrace/archive/refs/tags/v0.1.0.zip)

[HTTP 缓存的四个问题（英文）](https://qsxustc.github.io/freshtrace/learn/)：用可复现的小例子解释 max-age 与 s-maxage、已有 Age、no-cache 与 no-store，以及过期复用窗口。

粘贴响应头，拖动时间，查看浏览器缓存和共享缓存何时能直接复用、何时需要验证、何时必须访问源站。再放入另一套策略，在修改配置前看清差异。

FreshTrace 是一个可离线运行的 HTTP 缓存策略实验室，提供浏览器界面和命令行。两者共用同一个确定性的分析引擎，无需账号、API Key、AI 模型或运行时第三方依赖。

![FreshTrace 工作台：对比浏览器和共享缓存的策略时间线](docs/images/workbench.jpg)

```http
Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=120
ETag: "catalog-v3"
Age: 45
```

这个响应已经存在了 45 秒。私有缓存还剩 15 秒新鲜期，共享缓存还剩 255 秒。同一组响应头，在两个缓存中可能得到不同的判断。

## 本地运行

完整发布包包含对应标签的源码、CLI、文档，以及 `dist/` 中的静态浏览器构建。把 ZIP 和校验文件下载到同一个目录，在解压前验证：

```sh
# macOS
shasum -a 256 -c SHA256SUMS.txt
# Linux
sha256sum -c SHA256SUMS.txt
```

校验成功会显示 `freshtrace-v0.1.0.zip: OK`。解压后进入 `freshtrace-v0.1.0` 目录，或克隆仓库。需要 Node.js 20 或更高版本，然后执行：

```sh
npm start
```

打开终端打印的本地地址，通常为 `http://127.0.0.1:4174`。无需安装依赖。本地服务提供应用文件，响应头分析在浏览器内执行。

1. 加载预设，或在策略 A 中粘贴响应头。
2. 调整响应接收后的经过时间，查看新鲜期和过期后的变化。
3. 对比私有缓存与共享缓存的判断，阅读每个结果的原因。
4. 切换源站错误、带认证的请求、Vary 不匹配等条件，查看影响。
5. 输入策略 B，在相同条件下比较修改前后。可以下载 JSON 场景供之后导入，也可以导出 Markdown 报告。

## 能解决哪些疑问

| 疑问 | FreshTrace 展示的内容 |
| --- | --- |
| 为什么 CDN 的新鲜期比浏览器长？ | `max-age` 与 `s-maxage` 对两个缓存的影响 |
| `no-cache` 是否代表不能存储？ | 分别展示存储许可和复用前的验证要求 |
| 响应已有 `Age`，还剩多少时间？ | 初始年龄、当前年龄、剩余新鲜期 |
| TTL 到期后会发生什么？ | 验证、重新获取，以及支持的过期复用窗口 |
| 源站发生错误时能否复用旧响应？ | `stale-if-error` 的模拟窗口及阻止旧响应复用的指令 |
| 认证和 `Vary` 是否影响结果？ | 共享缓存权限与响应变体匹配检查 |
| 改一行响应头会有什么影响？ | 同一场景下的 A/B 策略对比 |

支持的响应指令包括 `no-store`、`no-cache`、`private`、`public`、`max-age`、`s-maxage`、`must-revalidate`、`proxy-revalidate`、`immutable`、`stale-while-revalidate`、`stale-if-error`；还会分析 `Age`、`Date`、`Expires`、`ETag`、`Last-Modified`、`Vary`。格式错误或含糊的策略会产生提示，并采用保守判断。

## 命令行

输入响应头文本文件，或以响应头名称为键的 JSON 对象：

```sh
node bin/freshtrace.js samples/cdn-response.json --elapsed 30
node bin/freshtrace.js samples/origin-outage.json --elapsed 150 --origin-error
node bin/freshtrace.js samples/cdn-response.json --cache shared --format json
```

第一个示例展示私有缓存和共享缓存的差异，第二个展示源站错误时的旧响应复用。浏览器中可以导入 [`samples/browser-vs-cdn.scenario.json`](samples/browser-vs-cdn.scenario.json)，加载完整的 A/B 对比场景。

也可以通过 stdin 输入：

```sh
printf '%s\n' 'Cache-Control: max-age=60, stale-if-error=300' 'ETag: "v1"' \
  | node bin/freshtrace.js - --elapsed 120 --origin-error
```

可选的实际抓取时间，让引擎计算响应的表观年龄与传输延迟：

```sh
node bin/freshtrace.js response-headers.txt \
  --requested-at 2026-10-14T08:00:00Z \
  --received-at 2026-10-14T08:00:02Z \
  --elapsed 90 --format markdown --output review.md
```

| 参数 | 含义 |
| --- | --- |
| `--elapsed <seconds>` | 接收响应后经过的秒数，默认 `0` |
| `--cache private\|shared\|both` | 缓存模型，默认 `both` |
| `--origin-error` | 模拟符合条件的源站错误 |
| `--authenticated` | 模拟原始请求携带 `Authorization` |
| `--vary-mismatch` | 模拟当前请求与存储的响应变体不匹配 |
| `--requested-at <ISO>` / `--received-at <ISO>` | 原始请求发出与响应接收的抓取时间 |
| `--format markdown\|json` | 输出格式，默认 `markdown` |
| `--output <path>` | 把报告写入文件 |
| `--force` | 允许覆盖已有输出文件 |
| `--help` / `--version` | 查看帮助或版本 |

CLI 也接受单行的 `Cache-Control` 值，例如 `public, max-age=60`。它只读取本地文件或 stdin，不抓取 URL，输入限制为 128 KiB。已有输出文件需要 `--force` 才能覆盖，输入文件不可被覆盖。

退出码：`0` 表示已成功生成报告，`1` 表示输入、分析或输出失败，`2` 表示命令参数错误。报告中有警告或响应不可缓存时仍返回 `0`；CLI 用于检查和解释，不是 CI 策略门禁。

## 结果建立在哪些假设上

FreshTrace v0.1 分析单个完整的 **GET 200** 响应，假设 URL 相同、存储的响应内容没有变化。它解释一个依据标准建立的模型，并不探测真实缓存。缓存配置、实现支持、淘汰策略、请求头和服务商自定义规则都可能改变实际表现。

仅提供响应头时假设状态码为 200。如果粘贴的文本包含 HTTP 状态行，状态码必须为 200，其他状态码会被拒绝。

没有提供抓取时钟时，有效的响应 `Date` 被视为接收时间，传输延迟为零。引擎不会用当前系统时间代替抓取时间，也不会在缺少显式新鲜期时猜测一个 TTL。完整支持范围、保守处理和边界条件见 [模型文档](docs/MODEL.md)。

依据为 [RFC 9111：HTTP Caching](https://httpwg.org/specs/rfc9111.html) 和 [RFC 5861：过期内容扩展](https://httpwg.org/specs/rfc5861.html)。FreshTrace 适合学习、排查和配置评审，不是浏览器或 CDN 合规认证工具。

## 隐私

响应头分析留在浏览器或本地 CLI 进程中。应用不包含统计脚本、外部字体或远程分析服务。场景 JSON 和 CLI JSON 包含输入的响应头。Markdown 报告不包含完整响应头，但警告可能引用部分输入。分享前请检查导出内容并移除私密值。详见 [SECURITY.md](SECURITY.md)。

## 构建与贡献

```sh
npm test
npm run build
npm run package:release
```

静态构建输出到 `dist/`。打包需要系统的 `zip` 命令，发布压缩包输出到 `release/freshtrace-v0.1.0.zip`；用 `npm run package:release -- --force` 覆盖已有压缩包。静态构建可以用静态服务器运行或部署到静态托管平台。仓库的 Pages workflow 已通过 GitHub Actions 部署在线工具。

发布提交的 42 项测试已通过 [Node.js 20、22、24 CI](https://github.com/qsxustc/freshtrace/actions/runs/38573617461)，[Pages 部署](https://github.com/qsxustc/freshtrace/actions/runs/38573617610)也已成功。[v0.1.0 正式发布](https://github.com/qsxustc/freshtrace/releases/tag/v0.1.0)由 [Release workflow](https://github.com/qsxustc/freshtrace/actions/runs/38577303096) 从不变的版本标签构建；发布包中的 37 个源码文件与标签逐字节一致，12 个静态构建文件与对应源码一致。不同时间重新打包可能产生不同的 ZIP 校验值，下载验证请使用正式发布附带的校验文件。

欢迎提交最小响应头案例、附有一手来源的语义修正、更清楚的解释和无障碍改进。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 相关项目

| 项目 | 关注点 | FreshTrace 的用途 |
| --- | --- | --- |
| [http-cache-semantics](https://github.com/kornelski/http-cache-semantics) | JavaScript 缓存许可与验证库 | 交互解释与策略对比 |
| [best-before](https://github.com/expo/best-before) | Web Cache API 上的 HTTP 缓存实现 | 无需拦截请求即可模拟决策 |
| [HTTP Cache Playground](https://github.com/hilverd/http-cache-playground) | 实际运行 Varnish 的响应头实验 | 无需缓存服务，在本地对比私有与共享缓存模型 |

以上均为独立项目。FreshTrace 在本仓库实现，不包含它们的代码。

## 许可证

MIT © 2026 Songxin Qu。见 [LICENSE](LICENSE)。
