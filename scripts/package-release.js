#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readdir, lstat, readFile, rm, rename, link } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { build } from './build.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOP_FILES = ['index.html', 'styles.css', 'icon.svg', 'package.json', 'README.md', 'README.zh-CN.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md', 'LICENSE', '.gitignore'];
const SOURCE_DIRS = ['src', 'bin', 'scripts', 'tests', 'samples', 'docs', '.github'];
const EXTENSIONS = new Set(['.js', '.json', '.md', '.txt', '.http', '.html', '.css', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.yml', '.yaml']);

let staging;
try {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--force') || args.length > 1) throw new Error('Usage: node scripts/package-release.js [--force]');
  const packageData = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(packageData.version)) throw new Error('Invalid package version.');
  const name = `freshtrace-v${packageData.version}`;
  const releaseDir = path.join(ROOT, 'release');
  try {
    const info = await lstat(releaseDir);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Release directory must be a directory without symlinks.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const destination = path.join(releaseDir, `${name}.zip`);
  let existing;
  try { existing = await lstat(destination); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing && !args.includes('--force')) throw new Error(`Release already exists: release/${name}.zip. Use --force to replace it.`);
  if (existing && (!existing.isFile() || existing.isSymbolicLink())) throw new Error('Release output must be a regular file.');
  const browserFiles = await build();
  const sourceFiles = [];
  for (const relative of TOP_FILES) if (await regularFile(relative)) sourceFiles.push(relative);
  for (const relative of SOURCE_DIRS) sourceFiles.push(...await collect(relative));
  staging = await mkdtemp(path.join(os.tmpdir(), 'freshtrace-release-'));
  const packageRoot = path.join(staging, name);
  for (const relative of [...sourceFiles, ...browserFiles.map(file => `dist/${file}`)]) {
    const output = path.join(packageRoot, relative);
    await mkdir(path.dirname(output), { recursive: true });
    await copyFile(path.join(ROOT, relative), output);
  }
  const temporaryZip = path.join(staging, `${name}.zip`);
  await zip(staging, temporaryZip, name);
  await mkdir(releaseDir, { recursive: true });
  // Copy to a temporary file beside the final archive, then rename atomically.
  const temporaryOutput = path.join(releaseDir, `.${name}-${process.pid}.zip`);
  try {
    await copyFile(temporaryZip, temporaryOutput);
    if (args.includes('--force')) await rename(temporaryOutput, destination);
    else await link(temporaryOutput, destination);
  } finally { await rm(temporaryOutput, { force: true }); }
  process.stdout.write(`Created release/${name}.zip (${sourceFiles.length} source files + ${browserFiles.length} browser files).\n`);
} catch (error) {
  process.stderr.write(`freshtrace release: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  if (staging) await rm(staging, { recursive: true, force: true });
}

async function regularFile(relative) {
  try {
    const info = await lstat(path.join(ROOT, relative));
    return info.isFile() && !info.isSymbolicLink();
  } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function collect(relative) {
  let entries;
  try {
    const info = await lstat(path.join(ROOT, relative));
    if (!info.isDirectory() || info.isSymbolicLink()) return [];
    entries = await readdir(path.join(ROOT, relative), { withFileTypes: true });
  } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.')) continue;
    const child = `${relative}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await collect(child));
    else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(child);
  }
  return files;
}

async function zip(cwd, output, directory) {
  return new Promise((resolve, reject) => {
    const child = spawn('zip', ['-q', '-r', output, directory], { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', error => reject(new Error(`System zip is required: ${error.message}`)));
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`zip failed (${code}): ${stderr.trim()}`)));
  });
}
