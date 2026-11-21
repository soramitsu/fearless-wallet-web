import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function fileHashes(root, relative = '', hashes = {}) {
  for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
    const name = join(relative, entry.name);
    if (entry.isDirectory()) fileHashes(root, name, hashes);
    else hashes[name] = createHash('sha256').update(readFileSync(join(root, name))).digest('hex');
  }
  return hashes;
}

for (const file of readdirSync('/downloads/crates')) {
  const root = join('/vendor', file.replace(/\.crate$/, ''));
  const digest = createHash('sha256').update(readFileSync(join('/downloads/crates', file))).digest('hex');
  writeFileSync(join(root, '.cargo-checksum.json'), JSON.stringify({ package: digest, files: fileHashes(root) }));
}
