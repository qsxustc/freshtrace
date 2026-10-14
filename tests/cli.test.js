import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdtemp, rm, link, symlink, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { formatReport } from '../src/report.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'bin/freshtrace.js');

function cli(args, input) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, input, encoding: 'utf8', timeout: 8000 });
}

async function temporary(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'freshtrace-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('CLI reports private and shared cache decisions from stdin', () => {
  const response = cli(['-', '--elapsed', '45', '--format', 'json'], 'Cache-Control: public, max-age=60, s-maxage=300\nAge: 30\nETag: "v1"\n');
  assert.equal(response.status, 0, response.stderr);
  const output = JSON.parse(response.stdout);
  assert.equal(output.version, '0.1.0');
  assert.deepEqual(output.results.map(result => result.cacheType), ['private', 'shared']);
  assert.deepEqual(output.results.map(result => result.currentAge), [75, 75]);
  assert.deepEqual(output.results.map(result => result.freshnessLifetime), [60, 300]);
  assert.notEqual(output.results[0].state, 'fresh');
  assert.equal(output.results[1].state, 'fresh');
});

test('CLI reads a JSON header object and supports a bare Cache-Control value', async t => {
  const directory = await temporary(t);
  const input = path.join(directory, 'headers.json');
  await writeFile(input, JSON.stringify({ 'Cache-Control': 'no-store' }));
  const fileResult = cli([input, '--cache', 'shared', '--format=json']);
  assert.equal(fileResult.status, 0, fileResult.stderr);
  assert.equal(JSON.parse(fileResult.stdout).results[0].storeAllowed, false);
  const bareResult = cli(['-', '--cache=private', '--format=json'], 'public, max-age=120');
  assert.equal(bareResult.status, 0, bareResult.stderr);
  assert.equal(JSON.parse(bareResult.stdout).results[0].freshnessLifetime, 120);
});

test('CLI passes origin error, request matching, authorization, and capture times to the engine', () => {
  const errorResult = cli(['-', '--elapsed', '90', '--origin-error', '--cache', 'private', '--format', 'json'], 'Cache-Control: max-age=60, stale-if-error=120');
  assert.equal(errorResult.status, 0, errorResult.stderr);
  assert.equal(JSON.parse(errorResult.stdout).results[0].state, 'sie');

  const varyResult = cli(['-', '--vary-mismatch', '--cache', 'private', '--format', 'json'], 'Cache-Control: max-age=120\nVary: Accept-Language\n');
  assert.equal(varyResult.status, 0, varyResult.stderr);
  assert.notEqual(JSON.parse(varyResult.stdout).results[0].state, 'fresh');

  const authResult = cli(['-', '--authenticated', '--cache', 'shared', '--format', 'json'], 'Cache-Control: max-age=120');
  assert.equal(authResult.status, 0, authResult.stderr);
  assert.equal(JSON.parse(authResult.stdout).results[0].storeAllowed, false);

  const captureResult = cli(['-', '--received-at', '2026-10-14T12:00:10Z', '--requested-at', '2026-10-14T12:00:00Z', '--elapsed', '2', '--cache', 'private', '--format', 'json'], 'Date: Wed, 14 Oct 2026 12:00:00 GMT\nAge: 5\nCache-Control: max-age=60\n');
  assert.equal(captureResult.status, 0, captureResult.stderr);
  const captured = JSON.parse(captureResult.stdout).results[0];
  assert.equal(captured.baseAge, 15);
  assert.equal(captured.currentAge, 17);
});

test('CLI produces a readable Markdown report and has help/version commands', () => {
  const response = cli(['-'], 'Cache-Control: public, max-age=60\nAge: 5\n');
  assert.equal(response.status, 0, response.stderr);
  assert.match(response.stdout, /^# FreshTrace cache report/);
  assert.match(response.stdout, /## Private cache/);
  assert.match(response.stdout, /## Shared cache/);
  assert.match(response.stdout, /60 s/);
  assert.match(cli(['--help']).stdout, /128 KiB/);
  assert.equal(cli(['--version']).stdout, '0.1.0\n');
});

test('CLI uses exit code 2 for invalid arguments and never fetches URLs', () => {
  for (const args of [[], ['-', '--cache', 'cdn'], ['-', '--elapsed', '-1'], ['-', '--elapsed', 'Infinity'], ['-', '--unknown'], ['-', '--format', 'html'], ['-', '--elapsed'], ['-', '--received-at', '2026-02-30T12:00:00Z'], ['-', '--received-at', 'yesterday'], ['-', '--requested-at', '2026-10-14T12:00:01Z', '--received-at', '2026-10-14T12:00:00Z'], ['https://example.com']]) {
    const result = cli(args, 'Cache-Control: max-age=60');
    assert.equal(result.status, 2, `${args.join(' ')}: ${result.stderr}`);
  }
});

test('CLI bounds file and stdin input and rejects invalid or empty input', async t => {
  const directory = await temporary(t);
  const large = 'x'.repeat(128 * 1024 + 1);
  const file = path.join(directory, 'large.txt');
  await writeFile(file, large);
  for (const response of [cli([file]), cli(['-'], large), cli(['-'], ''), cli(['-'], '{bad json'), cli(['-'], '[]'), cli([path.join(directory, 'missing.txt')])]) {
    assert.equal(response.status, 1, response.stderr);
    assert.equal(response.stdout, '');
  }
});

test('CLI protects an existing output and the original input, including hard links', async t => {
  const directory = await temporary(t);
  const input = path.join(directory, 'input.txt');
  const output = path.join(directory, 'report.md');
  const source = 'Cache-Control: max-age=60';
  await writeFile(input, source);
  await writeFile(output, 'keep me');
  let result = cli([input, '--output', output]);
  assert.equal(result.status, 1);
  assert.equal(await readFile(output, 'utf8'), 'keep me');
  result = cli([input, '--output', output, '--force']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(await readFile(output, 'utf8'), /^# FreshTrace/);
  result = cli([input, '--output', input, '--force']);
  assert.equal(result.status, 1);
  const hardlink = path.join(directory, 'hardlink.txt');
  await link(input, hardlink);
  result = cli([input, '--output', hardlink, '--force']);
  assert.equal(result.status, 1);
  const symlinkPath = path.join(directory, 'symlink.txt');
  await symlink(input, symlinkPath);
  result = cli([input, '--output', symlinkPath, '--force']);
  assert.equal(result.status, 1);
  assert.equal(await readFile(input, 'utf8'), source);
});

test('Markdown report escapes header-derived content', () => {
  const report = formatReport([{ cacheType: 'private', label: 'fresh | <script>', reason: '[click](https://bad.example)\n<script>', currentAge: 0, baseAge: 0, freshnessLifetime: 60, action: 'cache', warnings: ['<img src=x>'], notes: [], vary: ['x|y'], storeAllowed: true }]);
  assert.ok(!report.includes('<script>'));
  assert.ok(!report.includes('<img'));
  assert.match(report, /fresh \\\| &lt;script&gt;/);
  assert.match(report, /x\\\|y/);
});

test('static server falls back from a busy port and denies hidden files and path traversal', async t => {
  const blocker = http.createServer();
  await new Promise((resolve, reject) => { blocker.once('error', reject); blocker.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => blocker.close(resolve)));
  const occupiedPort = blocker.address().port;
  const child = spawn(process.execPath, [path.join(ROOT, 'scripts/serve.js'), '--port', String(occupiedPort)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { child.kill('SIGTERM'); });
  const port = await new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => { child.kill(); reject(new Error(`Server did not start: ${stderr}`)); }, 5000);
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited early (${code}): ${stderr}`)); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
      const match = /http:\/\/127\.0\.0\.1:(\d+)/.exec(stdout);
      if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
    });
  });
  assert.ok(port > occupiedPort && port <= occupiedPort + 30, `Expected fallback from occupied port ${occupiedPort}, got ${port}`);
  const get = (urlPath, method = 'GET') => new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port, path: urlPath, method }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    request.on('error', reject);
    request.end();
  });
  const module = await get('/src/cache.js');
  assert.equal(module.status, 200);
  assert.match(module.headers['content-type'], /javascript/);
  assert.equal((await get('/src/report.js', 'HEAD')).body, '');
  for (const target of ['/.git/config', '/%2e%2e/package.json', '/src/../../package.json', '/package.json', '/bin/freshtrace.js', '/src', '/%00']) {
    const result = await get(target);
    assert.ok([400, 404].includes(result.status), `${target}: ${result.status}`);
  }
  assert.equal((await get('/src/cache.js', 'POST')).status, 405);
});

test('build output contains the browser modules and excludes source tooling', async () => {
  const response = spawnSync(process.execPath, [path.join(ROOT, 'scripts/build.js')], { cwd: ROOT, encoding: 'utf8', timeout: 8000 });
  assert.equal(response.status, 0, response.stderr);
  const top = await readdir(path.join(ROOT, 'dist'));
  assert.ok(top.includes('index.html'));
  for (const name of ['bin', 'scripts', 'tests', '.git', 'package.json', 'release']) assert.ok(!top.includes(name), `${name} leaked into dist/`);
  const browserModules = await readdir(path.join(ROOT, 'dist/src'));
  for (const name of ['cache.js', 'report.js', 'scenario.js', 'timeline.js', 'app.js', 'presets.js']) assert.ok(browserModules.includes(name), `${name} missing from build`);
});
