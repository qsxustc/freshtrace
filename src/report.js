/** Format analyzed cache results as portable Markdown, without echoing raw headers. */
export function formatReport(results) {
  if (!Array.isArray(results) || results.length === 0) {
    throw new TypeError('formatReport expects a non-empty array of cache results.');
  }

  const lines = [
    '# FreshTrace cache report',
    '',
    'Offline analysis of a complete GET 200 response. The URL and stored representation are assumed to match. No request was sent to an origin or CDN.',
    '',
    '| Cache | Decision | Current age | Freshness lifetime | Action |',
    '| --- | --- | --- | --- | --- |',
  ];

  for (const result of results) {
    lines.push(`| ${escapeMarkdown(cacheName(result.cacheType))} | ${escapeMarkdown(result.label || result.state)} | ${duration(result.currentAge)} | ${duration(result.freshnessLifetime)} | ${escapeMarkdown(actionName(result.action))} |`);
  }

  for (const result of results) {
    lines.push('', `## ${cacheName(result.cacheType)} cache`, '', escapeMarkdown(result.reason || 'No explanation is available.'), '');
    lines.push(`- Storage: ${result.storeAllowed ? 'permitted by the analyzed policy' : 'not permitted by the analyzed policy'}.`);
    lines.push(`- Age on receipt: ${duration(result.baseAge)}. Current age: ${duration(result.currentAge)}.`);
    lines.push(`- Freshness lifetime: ${duration(result.freshnessLifetime)}. Source: ${escapeMarkdown(result.freshnessSource || 'unknown')}.`);
    lines.push(`- Validator: ${result.validator ? escapeMarkdown(result.validator) : 'none'}.`);
    if (result.staleWhileRevalidate > 0) {
      lines.push(`- Stale-while-revalidate window: ${duration(result.staleWhileRevalidate)} after freshness ends.`);
    }
    if (result.staleIfError > 0) {
      lines.push(`- Stale-if-error window: ${duration(result.staleIfError)} after freshness ends; requires an eligible origin error.`);
    }
    if (Array.isArray(result.vary) && result.vary.length > 0) {
      lines.push(`- Vary fields: ${result.vary.map(escapeMarkdown).join(', ')}.`);
    }
    if (result.blockingStale) {
      lines.push('- A revalidation requirement prevents serving this response stale.');
    }
    if (Array.isArray(result.warnings) && result.warnings.length > 0) {
      lines.push('', '### Warnings', '');
      for (const warning of result.warnings) lines.push(`- ${escapeMarkdown(warning)}`);
    }
    if (Array.isArray(result.notes) && result.notes.length > 0) {
      lines.push('', '### Notes', '');
      for (const note of result.notes) lines.push(`- ${escapeMarkdown(note)}`);
    }
  }

  lines.push('', 'FreshTrace interprets standard response caching headers. It does not simulate browser reloads, request cache directives, heuristic freshness, or provider-specific CDN overrides.', '');
  return lines.join('\n');
}

function cacheName(type) {
  return type === 'shared' ? 'Shared' : 'Private';
}

function actionName(action) {
  return ({ cache: 'Use cached response', 'background-validation': 'Serve and revalidate', validate: 'Validate with origin', fetch: 'Fetch from origin', error: 'Cannot reuse', unknown: 'Cannot determine' })[action] || String(action || 'unknown');
}

function duration(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'unknown';
  return `${Math.round(value * 1000) / 1000} s`;
}

function escapeMarkdown(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/[\r\n]+/g, ' ').replace(/([`*_{}\[\]()|])/g, '\\$1').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
