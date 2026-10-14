#!/usr/bin/env node
import { copyFile, mkdir, mkdtemp, readdir, lstat, realpath, rm, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BROWSER_FILES = ['index.html', 'styles.css', 'icon.svg', 'robots.txt', 'sitemap.xml', 'learn/index.html', 'learn/styles.css', 'learn/share.svg', 'assets/social-card.svg', 'assets/social-card.jpg', 'src/app.js', 'src/cache.js', 'src/presets.js', 'src/report.js', 'src/scenario.js', 'src/timeline.js'];

/** Produce only the browser runtime. Never copy arbitrary repository contents. */
export async function build() {
  const files = [...BROWSER_FILES, ...await sampleFiles()];
  const staging = await mkdtemp(path.join(ROOT, '.freshtrace-build-'));
  try {
    for (const relative of files) {
      const source = path.join(ROOT, relative);
      const info = await lstat(source);
      if (!info.isFile() || info.isSymbolicLink() || await realpath(source) !== source) throw new Error(`Build source must be a regular file without symlinks: ${relative}`);
      const destination = path.join(staging, relative);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(source, destination);
    }
    await rm(path.join(ROOT, 'dist'), { recursive: true, force: true });
    await rename(staging, path.join(ROOT, 'dist'));
    return files;
  } finally { await rm(staging, { recursive: true, force: true }); }
}

async function sampleFiles() {
  try {
    const entries = await readdir(path.join(ROOT, 'samples'), { withFileTypes: true });
    return entries.filter(entry => entry.isFile() && !entry.name.startsWith('.') && entry.name.endsWith('.json')).map(entry => `samples/${entry.name}`).sort();
  } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const files = await build();
    process.stdout.write(`Built ${files.length} browser files in dist/.\n`);
  } catch (error) {
    process.stderr.write(`freshtrace build: ${error.message}\n`);
    process.exitCode = 1;
  }
}
