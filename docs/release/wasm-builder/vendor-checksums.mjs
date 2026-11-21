import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

function fileHashes(root, relative = '', hashes = {}) {
  for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
    const name = join(relative, entry.name);
    if (entry.isDirectory()) fileHashes(root, name, hashes);
    else hashes[name] = createHash('sha256').update(readFileSync(join(root, name))).digest('hex');
  }
  return hashes;
}

// Writes Cargo's .cargo-checksum.json for each crate archive unpacked into the vendor directory.
const [crates = '/downloads/crates', vendor = '/vendor'] = process.argv.slice(2);
for (const file of readdirSync(crates)) {
  const root = join(vendor, file.replace(/\.crate$/, ''));
  const digest = createHash('sha256').update(readFileSync(join(crates, file))).digest('hex');
  writeFileSync(join(root, '.cargo-checksum.json'), JSON.stringify({ package: digest, files: fileHashes(root) }));
}
