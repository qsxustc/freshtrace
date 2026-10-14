#!/usr/bin/env node
import { readFile, stat, lstat, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { analyzeHeaders } from '../src/cache.js';
import { formatReport } from '../src/report.js';

const VERSION = '0.1.0';
const MAX_BYTES = 128 * 1024;
const HELP = `FreshTrace ${VERSION} — offline HTTP cache header analysis

Usage: freshtrace <headers.txt | headers.json | -> [options]

Read a response header block, a Cache-Control value, or a plain JSON header
object. Use - for stdin.
FreshTrace never fetches a URL. Input is limited to 128 KiB.

Options:
  --elapsed <seconds>       Time since response receipt (default: 0)
  --cache <type>            private, shared, or both (default: both)
  --origin-error           Simulate an eligible origin error
  --authenticated          Simulate a request with Authorization
  --vary-mismatch          Simulate nonmatching Vary request fields
  --received-at <ISO>       Response receipt time, with timezone
  --requested-at <ISO>      Request sent time, with timezone
  --format <type>           markdown or json (default: markdown)
  --output <path>           Write to a file instead of stdout
  --force                   Allow replacing an existing output file
  --help                    Show this help
  --version                 Print the version

Examples:
  freshtrace headers.txt --cache shared --elapsed 90
  cat headers.txt | freshtrace - --format json
  freshtrace headers.json --output report.md

Exit codes: 0 success, 1 input/analysis/output failure, 2 invalid arguments.
`;

class UsageError extends Error {}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) process.stdout.write(HELP);
  else if (args.version) process.stdout.write(`${VERSION}\n`);
  else await run(args);
} catch (error) {
  process.stderr.write(`freshtrace: ${error.message}\n`);
  if (error instanceof UsageError) process.stderr.write('Run freshtrace --help for usage.\n');
  process.exitCode = error instanceof UsageError ? 2 : 1;
}

async function run(args) {
  const source = args.input === '-' ? null : path.resolve(args.input);
  let sourceInfo;
  let input;
  if (source) {
    sourceInfo = await stat(source);
    if (!sourceInfo.isFile()) throw new Error('Input must be a regular file.');
    if (sourceInfo.size > MAX_BYTES) throw new Error('Input exceeds the 128 KiB limit.');
    input = await readFile(source, 'utf8');
  } else input = await readStdin();
  if (Buffer.byteLength(input, 'utf8') > MAX_BYTES) throw new Error('Input exceeds the 128 KiB limit.');
  input = input.replace(/^\uFEFF/, '');
  if (input.trim().length === 0) throw new Error('Input is empty; provide response headers.');
  const trimmed = input.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { input = JSON.parse(input); }
    catch (error) { throw new Error(`Invalid JSON input: ${error.message}`); }
    if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error('JSON input must be a plain header object.');
  } else if (!trimmed.includes('\n') && !/^[!#$%&'*+.^_`|~\w-]+:/.test(trimmed)) {
    input = `Cache-Control: ${trimmed}`;
  }

  const options = {
    elapsed: args.elapsed,
    originError: args.originError,
    authenticated: args.authenticated,
    varyMatches: !args.varyMismatch,
    ...(args.receivedAt ? { responseTime: args.receivedAt } : {}),
    ...(args.requestedAt ? { requestTime: args.requestedAt } : {}),
  };
  const cacheTypes = args.cache === 'both' ? ['private', 'shared'] : [args.cache];
  const results = cacheTypes.map(cacheType => analyzeHeaders(input, { ...options, cacheType }));
  const output = args.format === 'json'
    ? `${JSON.stringify({ version: VERSION, assumptions: options, results }, null, 2)}\n`
    : formatReport(results);
  if (!args.output) return process.stdout.write(output);

  const destination = path.resolve(args.output);
  if (source && destination === source) throw new Error('Output cannot overwrite the input file, even with --force.');
  let destinationInfo;
  try { destinationInfo = await lstat(destination); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (destinationInfo?.isSymbolicLink()) throw new Error('Refusing to write through an output symbolic link.');
  if (source && destinationInfo) {
    const inputReal = await realpath(source);
    const outputReal = await realpath(destination);
    if (inputReal === outputReal || (sourceInfo.dev === destinationInfo.dev && sourceInfo.ino === destinationInfo.ino)) {
      throw new Error('Output cannot overwrite the input file, even with --force.');
    }
  }
  if (destinationInfo && !args.force) throw new Error('Output already exists; use --force to replace it.');
  if (destinationInfo && !destinationInfo.isFile()) throw new Error('Output must be a regular file.');
  await writeFile(destination, output, { encoding: 'utf8', flag: args.force ? 'w' : 'wx' });
}

function parseArgs(argv) {
  const args = { elapsed: 0, cache: 'both', format: 'markdown', originError: false, authenticated: false, varyMismatch: false, force: false };
  const values = { '--elapsed': 'elapsed', '--cache': 'cache', '--received-at': 'receivedAt', '--requested-at': 'requestedAt', '--format': 'format', '--output': 'output' };
  const flags = { '--origin-error': 'originError', '--authenticated': 'authenticated', '--vary-mismatch': 'varyMismatch', '--force': 'force', '--help': 'help', '--version': 'version' };
  const seen = new Set();
  let positionalOnly = false;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!positionalOnly && token === '--') { positionalOnly = true; continue; }
    if (!positionalOnly && token.startsWith('--')) {
      const equals = token.indexOf('=');
      const key = equals >= 0 ? token.slice(0, equals) : token;
      if (!(key in values) && !(key in flags)) throw new UsageError(`Unknown option: ${key}`);
      if (seen.has(key)) throw new UsageError(`Option specified more than once: ${key}`);
      seen.add(key);
      if (key in flags) {
        if (equals >= 0) throw new UsageError(`${key} does not take a value.`);
        args[flags[key]] = true;
      } else {
        const value = equals >= 0 ? token.slice(equals + 1) : argv[++i];
        if (!value || value.startsWith('--')) throw new UsageError(`${key} requires a value.`);
        args[values[key]] = value;
      }
    } else {
      if (!positionalOnly && token.startsWith('-') && token !== '-') throw new UsageError(`Unknown option: ${token}`);
      if (args.input !== undefined) throw new UsageError('Provide exactly one input file, or - for stdin.');
      args.input = token;
    }
  }
  if (args.help || args.version) return args;
  if (args.input === undefined) throw new UsageError('Provide an input file, or - for stdin.');
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(args.input)) throw new UsageError('URLs are not supported; paste or save the response headers instead.');
  args.elapsed = Number(args.elapsed);
  if (!Number.isFinite(args.elapsed) || args.elapsed < 0) throw new UsageError('--elapsed must be a finite nonnegative number of seconds.');
  if (!['private', 'shared', 'both'].includes(args.cache)) throw new UsageError('--cache must be private, shared, or both.');
  if (!['markdown', 'json'].includes(args.format)) throw new UsageError('--format must be markdown or json.');
  for (const [key, label] of [['receivedAt', '--received-at'], ['requestedAt', '--requested-at']]) {
    if (args[key] && !validTimestamp(args[key])) {
      throw new UsageError(`${label} must be an ISO timestamp with timezone, such as 2026-01-01T12:00:00Z.`);
    }
  }
  if (args.receivedAt && args.requestedAt && Date.parse(args.requestedAt) > Date.parse(args.receivedAt)) throw new UsageError('--requested-at cannot be later than --received-at.');
  return args;
}

function validTimestamp(value) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](\d{2}):(\d{2}))$/i.exec(value);
  if (!parts || !Number.isFinite(Date.parse(value))) return false;
  const [, y, m, d, hh, mm, ss, zh = '0', zm = '0'] = parts;
  const year = Number(y);
  const month = Number(m);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return month >= 1 && month <= 12 && Number(d) >= 1 && Number(d) <= monthDays && Number(hh) < 24 && Number(mm) < 60 && Number(ss) < 60 && Number(zh) < 24 && Number(zm) < 60;
}

async function readStdin() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > MAX_BYTES) throw new Error('Input exceeds the 128 KiB limit.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
