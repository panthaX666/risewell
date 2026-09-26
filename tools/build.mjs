// Copies the files the app needs into dist/, ready to upload to any static host.
import { rmSync, mkdirSync, cpSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
const FILES = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'fonts', 'icons'];

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
for (const f of FILES) cpSync(new URL(f, root), new URL(f, dist), { recursive: true });
console.log(`Built dist/ with ${FILES.join(', ')}`);
