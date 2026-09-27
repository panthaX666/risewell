// Records a hash of every file the service worker caches, next to VERSION in
// sw.js. tests/sw.test.mjs fails when a cached file changes without a new stamp,
// and this script refuses to stamp until VERSION is bumped. Run: npm run stamp
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
const swFile = new URL('sw.js', root);
const TEXT = /\.(html|css|js|webmanifest)$/; // hashed with LF endings, so Git's CRLF checkout doesn't matter

export function readSw() {
  const src = readFileSync(swFile, 'utf8');
  const version = src.match(/const VERSION = '([^']+)'/)[1];
  const files = [...src.match(/const FILES = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)]
    .map((m) => m[1])
    .filter((f) => f !== './'); // same file as index.html
  const m = src.match(/\/\/ files-hash: (\S+) (\S+)/);
  return { src, version, files, stamped: m && { hash: m[1], version: m[2] } };
}

export function filesHash(files) {
  const h = createHash('sha256');
  for (const f of files) {
    let data = readFileSync(new URL(f, root));
    if (TEXT.test(f)) data = Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'));
    h.update(`${f}\0`).update(data).update('\0');
  }
  return h.digest('hex').slice(0, 16);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { src, version, files, stamped } = readSw();
  const hash = filesHash(files);
  if (stamped?.hash === hash && stamped.version === version) {
    console.log(`files-hash is up to date (${version}).`);
  } else if (stamped && stamped.hash !== hash && stamped.version === version) {
    console.error(`Cached files changed but VERSION is still ${version}. Bump VERSION in sw.js, then run npm run stamp again.`);
    process.exitCode = 1;
  } else {
    const line = `// files-hash: ${hash} ${version} (written by npm run stamp)`;
    const out = stamped
      ? src.replace(/\/\/ files-hash: .*/, line)
      : src.replace(/(const VERSION = .*\r?\n)/, `$1${line}\n`);
    writeFileSync(swFile, out);
    console.log(`Stamped ${version} with files-hash ${hash}.`);
  }
}
