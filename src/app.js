import { analyzeHeaders } from './cache.js';
import { formatReport } from './report.js';
import { presets } from './presets.js';
import { parseScenario, validateScenario, MAX_HEADERS } from './scenario.js';
import { buildTimeline } from './timeline.js';

const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
let language = navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
let activePolicy = 'a';
let inspectCache = 'private';
let results = {};
let debounce;
let toastTimer;
let animation;
let state = { schemaVersion: 1, policies: { a: presets[0].a, b: presets[0].b }, elapsed: 75, horizon: 1200, context: { originError: false, authenticated: false, varyMatches: true } };

const words = {
  local: ['Runs on your device', '在你的设备上运行'], model: ['How it works', '模型说明'],
  title: ['Cache headers.<br><span>Clear answers.</span>', '缓存响应头。<br><span>清晰的答案。</span>'],
  subtitle: ['Stop guessing what gets served. Paste headers, move through time,<br class="desktop-break"> and see the browser and CDN make their decisions.', '粘贴响应头，沿时间线观察，<br class="desktop-break">看清浏览器和 CDN 为什么命中缓存、验证或回源。'],
  introNote: ['One response.<br>Two caches.<br>Every decision explained.', '同一响应。<br>两种缓存。<br>每个决策都有原因。'],
  responseHeaders: ['Response headers', '响应头'], original: ['Original', '原策略'], alternative: ['Alternative', '对比策略'],
  editorHint: ['Paste a header block or Cache-Control value', '粘贴响应头或 Cache-Control 值'], copy: ['Copy', '复制'], copied: ['Copied to clipboard', '已复制到剪贴板'],
  tryExample: ['Try a scenario', '体验示例'], requestContext: ['Request context', '请求条件'], bothPolicies: ['Applies to A + B', '同时应用于 A 和 B'],
  originError: ['Origin is unavailable', '源站无法响应'], originHint: ['Test the stale-if-error window', '观察 stale-if-error 的可用区间'],
  auth: ['Request has Authorization', '请求携带 Authorization'], authHint: ['Check shared cache permission', '检查共享缓存是否获得许可'],
  vary: ['Vary headers match', 'Vary 指定的请求头相同'], varyHint: ['Same representation as the stored response', '请求的表示与已缓存的响应一致'],
  capture: ['Optional capture timestamps', '可选：实际抓取时间'], captureHint: ['Use actual request and response times to include transit delay and apparent age.', '提供请求和响应时间，可将传输耗时与表观年龄计入计算。'],
  received: ['Response received (ISO 8601)', '收到响应的时间（ISO 8601）'], requested: ['Request sent (ISO 8601)', '发送请求的时间（ISO 8601）'],
  privacy: ['Headers stay in this tab. No upload, no account, no analytics.', '响应头仅保留在当前标签页中，无上传、账号或分析追踪。'],
  timeTravel: ['TIME TRAVEL', '沿时间线观察'], nextRequest: ['When does the next request arrive?', '下一次请求会在什么时候到达？'],
  secondsLater: ['seconds after receipt', '秒后再次请求'], elapsed: ['Elapsed', '间隔'], fresh: ['Fresh', '新鲜可用'], swr: ['Background validation', '后台验证'], sie: ['On origin error', '源站故障时可用'], stale: ['Contact origin', '需要联系源站'],
  whatChanged: ['What changes at this moment?', '这个时刻有什么不同？'], underHood: ['Follow the decision', '查看决策依据'], inspectPolicy: ['Inspect policy', '查看策略'],
  takeWithYou: ['Take the explanation with you.', '把解释带到代码评审中。'], exportHint: ['A reproducible scenario or a ready-to-share report.', '保存可复现示例，或导出 Markdown 报告。'],
  import: ['Import', '导入'], scenario: ['Save scenario', '保存示例'], report: ['Export report ↗', '导出报告 ↗'],
  assumption: ['A standards-based model of a complete GET 200 response. Matching URL and cache key assumed. Without capture times: zero transit, receipt at Date. No heuristic TTL or provider overrides.', '基于标准的完整 GET 200 响应模型。假设 URL 和缓存键匹配。未提供抓取时间时，假设传输耗时为零、收到响应的时间等于 Date。不推测启发式 TTL 或厂商规则。'],
  footer: ['Small tool. Fewer cache surprises.', '一个小工具，减少缓存困惑。'], browser: ['Browser cache', '浏览器缓存'], shared: ['Shared cache / CDN', '共享缓存 / CDN'], edit: ['Edit', '编辑'],
  age: ['Current age', '当前响应年龄'], lifetime: ['Freshness lifetime', '保鲜期限'], unspecified: ['Unspecified', '未指定'], zero: ['Receipt', '收到响应'],
  cache: ['Serve from cache', '直接使用缓存'], background: ['Serve + validate in background', '使用缓存并后台验证'], validate: ['Validate with origin', '向源站验证'], fetch: ['Fetch a new response', '获取新响应'], error: ['Cannot serve this stored response', '无法使用已缓存的响应'], unknown: ['Cache implementation decides', '取决于缓存实现'],
  storage: ['Can this response be stored?', '响应可以被保存吗？'], allowed: ['Storage allowed', '允许保存'], disallowed: ['Storage not allowed', '不允许保存'],
  freshness: ['Which freshness rule wins?', '哪条规则决定保鲜期限？'], ageStep: ['How old is the response now?', '响应现在有多旧？'], reuse: ['What can the cache do?', '缓存可以怎么处理？'],
  invalid: ['Cannot analyze these headers', '无法分析当前响应头'], seconds: ['seconds', '秒'], notes: ['Model notes', '模型注释'], noTTL: ['No explicit lifetime. FreshTrace does not guess a heuristic TTL.', '没有显式期限。FreshTrace 不推测启发式 TTL。'],
  saved: ['Scenario saved. It includes the headers you entered.', '示例已保存，包含你输入的响应头。'], imported: ['Scenario imported', '示例已导入'], exported: ['Markdown report exported', 'Markdown 报告已导出'],
  fileLarge: ['Choose a scenario JSON under 160 KiB.', '请选择小于 160 KiB 的示例 JSON。'],
  play: ['Play timeline', '播放时间线'], pause: ['Pause timeline', '暂停时间线'],
};
const t = key => words[key]?.[language === 'zh' ? 1 : 0] ?? key;
const stateLabels = {
  fresh: ['Fresh', '新鲜可用'], swr: ['Background validation', '后台验证'], sie: ['Stale on error', '故障时使用旧响应'],
  revalidate: ['Revalidate', '重新验证'], fetch: ['Fetch from origin', '回源获取'], blocked: ['Unavailable', '无法复用'], unknown: ['TTL unspecified', '期限未指定'],
};
const labelFor = result => stateLabels[result.state]?.[language === 'zh' ? 1 : 0] ?? result.label;
const cacheName = type => t(type === 'private' ? 'browser' : 'shared');

function shortTime(value) {
  if (value === null) return t('unspecified');
  if (value < 60) return `${Math.round(value * 10) / 10}s`;
  if (value < 3600) return `${Math.round(value / 60 * 10) / 10}m`;
  if (value < 86400) return `${Math.round(value / 3600 * 10) / 10}h`;
  return `${Math.round(value / 86400 * 10) / 10}d`;
}

function headerInput(value) {
  const clean = value.trim();
  if (clean.startsWith('{')) {
    try { return JSON.parse(clean); } catch { throw new Error(language === 'zh' ? '响应头 JSON 格式无效。' : 'Header JSON is not valid.'); }
  }
  if (clean && !clean.includes('\n') && !/^[A-Za-z0-9-]+\s*:/.test(clean)) return `Cache-Control: ${clean}`;
  return clean;
}

function readContext() {
  const context = { originError: $('origin-error').checked, authenticated: $('authenticated').checked, varyMatches: $('vary-matches').checked };
  if ($('received-at').value.trim()) context.responseTime = $('received-at').value.trim();
  if ($('requested-at').value.trim()) context.requestTime = $('requested-at').value.trim();
  state.context = context;
}

function syncInputs() {
  $('header-editor').value = state.policies[activePolicy];
  for (const name of ['a', 'b']) {
    $(`tab-${name}`).classList.toggle('active', activePolicy === name);
    $(`tab-${name}`).setAttribute('aria-selected', String(activePolicy === name));
    $(`tab-${name}`).tabIndex = activePolicy === name ? 0 : -1;
  }
  $('header-editor').setAttribute('aria-label', `${t('responseHeaders')} ${activePolicy.toUpperCase()}`);
  $('origin-error').checked = state.context.originError;
  $('authenticated').checked = state.context.authenticated;
  $('vary-matches').checked = state.context.varyMatches;
  $('received-at').value = state.context.responseTime ?? '';
  $('requested-at').value = state.context.requestTime ?? '';
}

function setPolicy(name, focus = false) {
  clearTimeout(debounce);
  activePolicy = name;
  syncInputs();
  render();
  if (focus) $('header-editor').focus();
}

function translate() {
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  for (const element of document.querySelectorAll('[data-i18n]')) {
    const key = element.dataset.i18n;
    if (['title', 'subtitle', 'introNote'].includes(key)) element.innerHTML = t(key);
    else element.textContent = t(key);
  }
  $('language-button').textContent = language === 'zh' ? 'EN' : '中文';
  $('language-button').setAttribute('aria-label', language === 'zh' ? 'Switch to English' : '切换为中文');
  $('play-button').setAttribute('aria-label', t('play'));
  const selected = $('preset-select').value || presets[0].id;
  $('preset-select').innerHTML = presets.map(preset => `<option value="${preset.id}">${escape(preset.name[language === 'zh' ? 1 : 0])}</option>`).join('') + `<option value="custom">${language === 'zh' ? '自定义策略' : 'Custom scenario'}</option>`;
  $('preset-select').value = selected;
  updateDescription();
  $('inspect-policy').innerHTML = `<option value="a">A · ${t('original')}</option><option value="b">B · ${t('alternative')}</option>`;
  $('inspect-policy').value = activeInspectPolicy;
  $('model-content').innerHTML = modelContent();
  syncInputs();
  render();
}

function updateDescription() {
  const preset = presets.find(item => item.id === $('preset-select').value);
  $('preset-description').textContent = preset ? preset.description[language === 'zh' ? 1 : 0] : (language === 'zh' ? '修改任一策略，然后比较两种缓存的决策。' : 'Edit either policy and compare the decisions in both caches.');
}

function loadPreset(id) {
  stop();
  const preset = presets.find(item => item.id === id);
  if (!preset) return;
  state = { schemaVersion: 1, policies: { a: preset.a, b: preset.b }, elapsed: preset.elapsed, horizon: preset.horizon, context: { originError: !!preset.originError, authenticated: !!preset.authenticated, varyMatches: true } };
  syncInputs();
  updateDescription();
  render();
}

const icon = type => type === 'private'
  ? '<svg class="cache-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="9" rx="1"/><path d="M5 14h6M8 11v3"/></svg>'
  : '<svg class="cache-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 12a3 3 0 0 1-.5-6 4.5 4.5 0 0 1 8.5-1 3.5 3.5 0 0 1 0 7Z"/></svg>';

function timeline(result) {
  let segments = '';
  const clamp = value => Math.max(0, Math.min(100, value / state.horizon * 100));
  const segment = (start, end, kind) => {
    const left = clamp(start), right = clamp(end);
    if (right > left) segments += `<span class="timeline-segment ${kind}" style="left:${left}%;width:${right - left}%"></span>`;
  };
  for (const range of buildTimeline(result, state.context, state.horizon)) segment(range.start, range.end, range.state);
  return `<div class="mini-timeline" role="img" aria-label="${escape(`${cacheName(result.cacheType)}: ${labelFor(result)}; ${t('elapsed')} ${state.elapsed}s`)}">${segments}<i class="timeline-cursor" style="left:${clamp(state.elapsed)}%"></i></div><div class="timeline-caption"><span>${t('zero')}</span><span>+${shortTime(state.horizon)}</span></div>`;
}

function renderCache(result) {
  const action = { cache: t('cache'), 'background-validation': t('background'), validate: t('validate'), fetch: t('fetch'), error: t('error'), unknown: t('unknown') }[result.action] ?? result.action;
  return `<div class="cache-row"><div class="cache-title"><span class="cache-kind">${icon(result.cacheType)}${cacheName(result.cacheType)}</span><span class="state-pill ${escape(result.state)}">${escape(labelFor(result))}</span></div><div class="cache-metrics"><div><div class="metric-value">${shortTime(result.currentAge)}</div><span class="metric-name">${t('age')}</span></div><div><div class="metric-value">${result.freshnessLifetime === null ? '<small>' + t('unspecified') + '</small>' : shortTime(result.freshnessLifetime)}</div><span class="metric-name">${t('lifetime')}</span></div></div>${timeline(result)}<p class="decision-reason">${escape(localReason(result))}</p><div class="cache-action"><span aria-hidden="true">${['cache', 'background-validation'].includes(result.action) ? '↳' : '↗'}</span><span>${escape(action)}</span></div></div>`;
}

function localReason(result) {
  if (language !== 'zh') return result.reason;
  if (result.state === 'fresh') return `响应年龄 ${shortTime(result.currentAge)} 小于保鲜期限 ${shortTime(result.freshnessLifetime)}，可以直接使用缓存。`;
  if (result.state === 'swr') return '响应已过期，但处于 stale-while-revalidate 窗口内，可先使用旧响应并在后台验证。';
  if (result.state === 'sie') return '源站无法响应，且尚未超过 stale-if-error 的最大允许过期时间。';
  if (!result.storeAllowed) {
    if (result.directives.some(item => item.name === 'no-store')) return 'no-store 禁止缓存保存此响应，每次请求都需要联系源站。';
    if (result.cacheType === 'shared' && result.directives.some(item => item.name === 'private')) return 'private 限制共享缓存；本模型不模拟删除指定响应头后的存储。';
    return '当前请求或响应条件不允许这种缓存保存并复用响应。';
  }
  if (result.directives.some(item => item.name === 'no-cache')) return 'no-cache 允许保存响应，但每次复用前都必须成功验证。';
  if (result.vary?.includes('*')) return 'Vary: * 无法与后续请求匹配，需要联系源站。';
  if (!state.context.varyMatches && result.vary?.length) return 'Vary 指定的请求头不匹配，缓存中不是本次请求所需的表示。';
  if (result.state === 'unknown') return t('noTTL');
  if (result.state === 'blocked') return '源站不可用，当前策略也不允许在这一时刻使用旧响应。';
  if (result.state === 'revalidate') return '此响应需要验证，缓存可以向源站发送条件请求。成功验证后才能复用。';
  return '响应已无法直接复用，需要从源站获取新响应。';
}

function renderPolicy(name) {
  const target = $(`result-${name}`);
  const policyResults = results[name];
  target.innerHTML = `<div class="result-heading"><span class="result-name"><span class="letter">${name.toUpperCase()}</span>${t(name === 'a' ? 'original' : 'alternative')}</span><button class="text-button" data-edit="${name}">${t('edit')} ↗</button></div>` + (policyResults?.error ? `<div class="result-error">${t('invalid')}<br>${escape(policyResults.error)}</div>` : policyResults.map(renderCache).join(''));
}

let activeInspectPolicy = 'a';
function renderInspection() {
  const selected = results[activeInspectPolicy];
  if (selected?.error) { $('inspection').innerHTML = `<p class="warning">${escape(selected.error)}</p>`; return; }
  const result = selected.find(item => item.cacheType === inspectCache);
  const freshnessText = result.freshnessLifetime === null ? t('noTTL') : (language === 'zh'
    ? `${result.freshnessSource} → ${result.freshnessLifetime} 秒。共享缓存优先 s-maxage，然后 max-age，再然后 Expires。`
    : `${result.freshnessSource} → ${result.freshnessLifetime} seconds. Shared caches prefer s-maxage, then max-age, then Expires.`);
  const ageText = language === 'zh' ? `收到响应时的年龄 ${result.baseAge} 秒 + 驻留时间 ${state.elapsed} 秒 = ${result.currentAge} 秒。Age 不会在响应到达时重置。` : `Age at receipt ${result.baseAge}s + residence ${state.elapsed}s = ${result.currentAge}s. Age does not reset when a response arrives.`;
  const storageText = result.storeAllowed ? (language === 'zh' ? '在当前 GET 200 响应模型与请求条件下允许保存。保存不代表每次都能直接复用。' : 'Allowed under the GET 200 model and current request context. Storage permission does not guarantee reuse.') : localReason(result);
  const steps = [[t('storage') + ' · ' + t(result.storeAllowed ? 'allowed' : 'disallowed'), storageText], [t('freshness'), freshnessText], [t('ageStep'), ageText], [t('reuse') + ' · ' + labelFor(result), result.reason]];
  $('inspection').innerHTML = `<div class="inspect-tabs" role="group" aria-label="Cache type"><button data-cache="private" class="${inspectCache === 'private' ? 'active' : ''}" aria-pressed="${inspectCache === 'private'}">${t('browser')}</button><button data-cache="shared" class="${inspectCache === 'shared' ? 'active' : ''}" aria-pressed="${inspectCache === 'shared'}">${t('shared')}</button></div><ol class="step-list">${steps.map(([title, body], index) => `<li><span class="step-number">${index + 1}</span><div><strong>${escape(title)}</strong><p>${escape(body)}</p></div></li>`).join('')}</ol>${result.warnings.map(warning => `<p class="warning">${escape(warning)}</p>`).join('')}<div class="directives">${result.directives.map(directive => `<span class="directive">${escape(directive.name)}${directive.value !== null && directive.value !== undefined ? '=' + escape(directive.value) : ''}</span>`).join('')}</div>${result.notes.length ? `<div class="notes">${result.notes.map(escape).join('<br>')}</div>` : ''}`;
}

function renderTakeaway() {
  if (results.a.error || results.b.error) { $('takeaway').textContent = language === 'zh' ? '修正响应头或时间输入后，即可比较两个策略。' : 'Fix the headers or capture timestamps to compare both policies.'; return; }
  const a = results.a, b = results.b;
  const outcomes = ['private', 'shared'].map((type, index) => {
    if (a[index].state !== b[index].state) return language === 'zh'
      ? `${cacheName(type)}：A ${labelFor(a[index])}，B ${labelFor(b[index])}。`
      : `${cacheName(type)}: A ${labelFor(a[index]).toLowerCase()} → B ${labelFor(b[index]).toLowerCase()}.`;
    if (a[index].freshnessLifetime !== b[index].freshnessLifetime) return language === 'zh'
      ? `${cacheName(type)}：当前均为${labelFor(a[index])}，保鲜期限从 ${shortTime(a[index].freshnessLifetime)} 变为 ${shortTime(b[index].freshnessLifetime)}。`
      : `${cacheName(type)}: both ${labelFor(a[index]).toLowerCase()} now; freshness changes from ${shortTime(a[index].freshnessLifetime)} to ${shortTime(b[index].freshnessLifetime)}.`;
    return language === 'zh' ? `${cacheName(type)}：当前决策相同（${labelFor(a[index])}）。` : `${cacheName(type)}: same decision now (${labelFor(a[index]).toLowerCase()}).`;
  });
  $('takeaway').textContent = outcomes.join(' ');
}

function renderTime() {
  const max = Math.min(2147483648, Math.max(state.horizon, state.elapsed));
  state.horizon = max;
  $('elapsed-display').textContent = String(Math.round(state.elapsed * 10) / 10);
  $('elapsed-number').value = state.elapsed;
  $('elapsed-slider').max = max;
  $('elapsed-slider').value = state.elapsed;
  $('ruler').innerHTML = [0, .25, .5, .75, 1].map(fraction => `<span>${shortTime(max * fraction)}</span>`).join('');
}

function render() {
  results = {};
  for (const name of ['a', 'b']) {
    try {
      if (state.policies[name].length > MAX_HEADERS || new TextEncoder().encode(state.policies[name]).byteLength > MAX_HEADERS) throw new Error('Header text must be under 64 KiB.');
      results[name] = ['private', 'shared'].map(cacheType => analyzeHeaders(headerInput(state.policies[name]), { ...state.context, elapsed: state.elapsed, cacheType }));
    } catch (error) { results[name] = { error: error.message }; }
    renderPolicy(name);
  }
  const errors = results[activePolicy].error;
  $('input-error').hidden = !errors;
  $('input-error').textContent = errors ?? '';
  $('report-button').disabled = !!(results.a.error || results.b.error);
  renderTime();
  renderTakeaway();
  renderInspection();
}

function setElapsed(value) {
  if (!Number.isFinite(value) || value < 0 || value > 2147483648) return false;
  state.elapsed = value;
  render();
  return true;
}

function stop() {
  if (animation) cancelAnimationFrame(animation);
  animation = null;
  $('play-button').textContent = '▶';
  $('play-button').setAttribute('aria-label', t('play'));
}

function play() {
  if (animation) { stop(); return; }
  if (state.elapsed >= state.horizon) state.elapsed = 0;
  const startElapsed = state.elapsed;
  const startTime = performance.now();
  $('play-button').textContent = 'Ⅱ';
  $('play-button').setAttribute('aria-label', t('pause'));
  let lastRender = 0;
  const frame = now => {
    if (now - lastRender >= 60) {
      state.elapsed = Math.min(state.horizon, Math.round(startElapsed + (now - startTime) / 1000 * state.horizon / 20));
      render(); lastRender = now;
    }
    if (state.elapsed >= state.horizon) { stop(); return; }
    animation = requestAnimationFrame(frame);
  };
  animation = requestAnimationFrame(frame);
}

function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4200);
}

function download(name, contents, type) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportReport() {
  if (results.a.error || results.b.error) return;
  const section = items => formatReport(items).replace(/^(#{1,3}) /gm, (_, hashes) => '#'.repeat(hashes.length + 2) + ' ');
  const report = '# FreshTrace · Cache policy comparison\n\n' + '> Complete GET 200 response model. These are independent cache decisions, not a live browser or CDN test.\n\n' + '## A · Original\n\n' + section(results.a) + '\n\n## B · Alternative\n\n' + section(results.b) + '\n\n## Reproduce\n\nDownload the scenario JSON from FreshTrace and import it in the app. Reports contain derived policy values and explanations; inspect them before sharing.\n';
  download('freshtrace-report.md', report, 'text/markdown;charset=utf-8');
  toast(t('exported'));
}

function modelContent() {
  if (language === 'zh') return `<div class="dialog-body"><p><strong>FreshTrace 是一个响应头解释器，不会访问你的服务器。</strong>两套策略在相同请求条件和经过时间下，分别计算私有缓存（如浏览器）和共享缓存（如 CDN）的决策。</p><p>显式期限优先级：共享缓存优先 <code>s-maxage</code>，否则使用 <code>max-age</code>，再否则使用 <code>Expires − Date</code>。没有显式期限时，结果显示为未指定。</p><p>响应年龄包括已有 <code>Age</code> 与保存后的时间。如果提供实际请求和响应时间，则按 RFC 9111 纳入传输耗时与表观年龄；否则假设收到响应的时间等于 <code>Date</code>，传输耗时为零。</p><p><code>no-cache</code> 要求验证，<code>no-store</code> 禁止存储。<code>must-revalidate</code>、共享缓存中的 <code>proxy-revalidate</code> / <code>s-maxage</code> 会在本模型中保守地阻止过期复用。陈旧内容扩展只表示允许，实际实现可以不使用。</p><p>模型假设完整 GET 200 响应、相同 URL 和缓存键，不模拟缓存淘汰、成功验证后的更新、请求 Cache-Control、浏览器刷新、CDN 配置覆盖、部分响应或 Service Worker。带字段列表的 private / no-cache 被保守地视为完整限制。<code>Set-Cookie</code> 与 immutable 不改变正常重复请求的判定。</p><p>保存的示例包含你输入的原始响应头，不进行脱敏；分享前请检查。当前标签页关闭或刷新后会清空输入。</p><p>依据：<a href="https://httpwg.org/specs/rfc9111.html" target="_blank" rel="noopener noreferrer">RFC 9111</a> · <a href="https://httpwg.org/specs/rfc5861.html" target="_blank" rel="noopener noreferrer">RFC 5861</a></p></div>`;
  return `<div class="dialog-body"><p><strong>FreshTrace explains headers. It does not contact your server.</strong> Two policies receive the same elapsed time and request context. Private caches (like a browser) and shared caches (like a CDN) are evaluated independently.</p><p>Explicit freshness comes from <code>s-maxage</code> for shared caches, otherwise <code>max-age</code>, otherwise <code>Expires − Date</code>. Without an explicit lifetime, the model reports it as unspecified.</p><p>Age includes the existing <code>Age</code> value plus time in the cache. Real request and response timestamps add transit delay and apparent age using RFC 9111. Without them, receipt is assumed to happen at <code>Date</code> with zero transit delay.</p><p><code>no-cache</code> requires validation; <code>no-store</code> forbids storage. This model conservatively blocks stale reuse with <code>must-revalidate</code> and, in shared caches, <code>proxy-revalidate</code> / <code>s-maxage</code>. Stale extensions permit reuse; a cache may choose not to use them.</p><p>Assumptions: complete GET 200 response, same URL and cache key. No eviction, updating after successful validation, request Cache-Control, reload, CDN overrides, partial responses, or Service Workers. Qualified private / no-cache directives are treated as full restrictions. <code>Set-Cookie</code> and immutable do not alter the normal repeat-request decision.</p><p>Saved scenarios include your original headers and are not redacted. Review them before sharing. Refreshing or closing this tab clears your inputs.</p><p>Based on <a href="https://httpwg.org/specs/rfc9111.html" target="_blank" rel="noopener noreferrer">RFC 9111</a> and <a href="https://httpwg.org/specs/rfc5861.html" target="_blank" rel="noopener noreferrer">RFC 5861</a>.</p></div>`;
}

$('header-editor').addEventListener('input', () => {
  stop(); state.policies[activePolicy] = $('header-editor').value;
  $('preset-select').value = 'custom'; updateDescription();
  clearTimeout(debounce); debounce = setTimeout(render, 100);
});
for (const name of ['a', 'b']) {
  $(`tab-${name}`).addEventListener('click', () => setPolicy(name));
  $(`tab-${name}`).addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); setPolicy(event.key === 'Home' ? 'a' : event.key === 'End' ? 'b' : activePolicy === 'a' ? 'b' : 'a'); $(`tab-${activePolicy}`).focus();
    }
  });
}
$('preset-select').addEventListener('change', event => loadPreset(event.target.value));
for (const id of ['origin-error', 'authenticated', 'vary-matches']) $(id).addEventListener('change', () => { stop(); readContext(); render(); });
for (const id of ['received-at', 'requested-at']) $(id).addEventListener('input', () => { stop(); readContext(); clearTimeout(debounce); debounce = setTimeout(render, 150); });
$('elapsed-slider').addEventListener('input', event => { stop(); setElapsed(Number(event.target.value)); });
$('elapsed-number').addEventListener('input', event => { stop(); if (event.target.value !== '') setElapsed(Number(event.target.value)); });
$('elapsed-number').addEventListener('change', () => renderTime());
$('play-button').addEventListener('click', play);
$('inspect-policy').addEventListener('change', event => { activeInspectPolicy = event.target.value; renderInspection(); });
document.addEventListener('click', event => {
  const editButton = event.target.closest('[data-edit]');
  if (editButton) setPolicy(editButton.dataset.edit, true);
  const cacheButton = event.target.closest('[data-cache]');
  if (cacheButton) { inspectCache = cacheButton.dataset.cache; renderInspection(); }
});
$('language-button').addEventListener('click', () => { stop(); language = language === 'zh' ? 'en' : 'zh'; translate(); });
$('copy-policy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(state.policies[activePolicy]); toast(t('copied')); } catch { $('header-editor').focus(); $('header-editor').select(); toast(language === 'zh' ? '已选中文本，请按 Ctrl/Cmd+C 复制。' : 'Text selected. Press Ctrl/Cmd+C to copy.'); }
});
$('scenario-button').addEventListener('click', () => {
  stop();
  try { const safe = validateScenario(state); download('freshtrace-scenario.json', JSON.stringify(safe, null, 2) + '\n', 'application/json'); toast(t('saved')); } catch (error) { toast(error.message); }
});
$('report-button').addEventListener('click', () => { clearTimeout(debounce); render(); exportReport(); });
$('import-button').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = '';
  if (!file) return;
  stop(); clearTimeout(debounce);
  try {
    if (file.size > 160 * 1024) throw new Error(t('fileLarge'));
    state = parseScenario(await file.text());
    $('preset-select').value = 'custom'; updateDescription(); syncInputs(); render(); toast(t('imported'));
  } catch (error) { toast(error.message); }
});
$('model-button').addEventListener('click', () => $('model-dialog').showModal());
$('close-model').addEventListener('click', () => $('model-dialog').close());
$('model-dialog').addEventListener('click', event => { if (event.target === $('model-dialog')) { const rect = $('model-dialog').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('model-dialog').close(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
translate();
