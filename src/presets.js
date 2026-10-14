export const presets = [
  {
    id: 'edge', name: ['Browser vs CDN', '浏览器与 CDN'],
    description: ['The same response can stay fresh for different amounts of time in each cache.', '同一响应在浏览器和 CDN 中可以拥有不同的保鲜时间。'],
    a: 'Cache-Control: public, max-age=60, stale-while-revalidate=120, stale-if-error=600\nAge: 0\nETag: "catalog-v3"\nVary: Accept-Encoding',
    b: 'Cache-Control: public, max-age=300, s-maxage=900, stale-while-revalidate=120, stale-if-error=600\nAge: 0\nETag: "catalog-v3"\nVary: Accept-Encoding',
    elapsed: 75, horizon: 1200,
  },
  {
    id: 'no-cache', name: ['no-cache ≠ no-store', 'no-cache ≠ no-store'],
    description: ['One policy can keep a response and validate it. The other forbids storing it.', '一个策略可以保存响应并重新验证；另一个禁止保存响应。'],
    a: 'Cache-Control: no-cache\nETag: "page-v1"', b: 'Cache-Control: no-store\nETag: "page-v1"', elapsed: 0, horizon: 300,
  },
  {
    id: 'age', name: ['The Age header matters', 'Age 头已经开始计时'],
    description: ['A response arriving with Age: 240 has already used four minutes of its freshness.', '带着 Age: 240 到达的响应，已经消耗了四分钟的保鲜时间。'],
    a: 'Cache-Control: public, max-age=300\nAge: 240\nETag: "inventory-v2"', b: 'Cache-Control: public, max-age=300\nAge: 0\nETag: "inventory-v2"', elapsed: 75, horizon: 600,
  },
  {
    id: 'outage', name: ['When the origin goes down', '当源站无法响应'],
    description: ['Compare stale-if-error with a policy that requires successful validation.', '比较 stale-if-error 与必须成功验证后才能复用的策略。'],
    a: 'Cache-Control: public, max-age=60, stale-if-error=600\nETag: "feed-v5"', b: 'Cache-Control: public, max-age=60, must-revalidate, stale-if-error=600\nETag: "feed-v5"', elapsed: 150, horizon: 900, originError: true,
  },
  {
    id: 'private', name: ['Keep a response private', '限制个人响应的共享缓存'],
    description: ['Authorization does not automatically forbid browser caching. Shared caches need permission.', 'Authorization 不会自动禁止浏览器缓存，但共享缓存需要明确许可。'],
    a: 'Cache-Control: public, max-age=300\nETag: "profile-v1"', b: 'Cache-Control: private, max-age=300\nETag: "profile-v1"', elapsed: 30, horizon: 600, authenticated: true,
  },
  {
    id: 'expires', name: ['Expires vs max-age', 'Expires 与 max-age 的优先级'],
    description: ['max-age takes precedence over Expires, even when the dates look more generous.', '即使 Expires 的时间更长，max-age 仍然优先。'],
    a: 'Date: Wed, 14 Oct 2026 10:00:00 GMT\nExpires: Wed, 14 Oct 2026 10:10:00 GMT\nETag: "doc-v1"', b: 'Cache-Control: max-age=60\nDate: Wed, 14 Oct 2026 10:00:00 GMT\nExpires: Wed, 14 Oct 2026 10:10:00 GMT\nETag: "doc-v1"', elapsed: 120, horizon: 900,
  },
];
