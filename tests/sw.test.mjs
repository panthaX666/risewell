import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSw, filesHash } from '../tools/stamp.mjs';

// Installed phones serve cached files until VERSION changes, so a release that
// edits a cached file without bumping VERSION would never reach them.
test('cached files match the files-hash stamped in sw.js', () => {
  const { version, files, stamped } = readSw();
  assert.ok(stamped, 'sw.js has no files-hash line. Bump VERSION and update files-hash: npm run stamp');
  assert.ok(
    stamped.hash === filesHash(files) && stamped.version === version,
    'Bump VERSION and update files-hash: change VERSION in sw.js, then run npm run stamp',
  );
});
