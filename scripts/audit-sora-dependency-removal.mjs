import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const blocked = /@sora-substrate\/|sora2-substrate-js-library/iu;
export function auditSoraDependencyRemoval(root) {
  for (const name of ['package.json', 'yarn.lock', 'pnpm-lock.yaml', 'package-lock.json', '.yarnrc.yml']) {
    const file = path.join(root, name);
    if (fs.existsSync(file) && blocked.test(fs.readFileSync(file, 'utf8'))) throw new Error(`Removed SORA dependency in ${name}`);
  }
  const installed = path.join(root, 'node_modules/@sora-substrate');
  if (fs.existsSync(installed) && fs.readdirSync(installed).length) throw new Error('Removed SORA packages remain installed');
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && /\.(?:[cm]?[jt]sx?|vue|json)$/u.test(entry.name)) {
        // Inert provenance is retained for attribution, never imported by runtime.
        if (path.relative(root, file) === 'src/sora/schema/provenance.json') continue;
        if (blocked.test(fs.readFileSync(file, 'utf8'))) throw new Error(`Removed SORA dependency in ${path.relative(root, file)}`);
      }
    }
  }
  visit(path.join(root, 'src'));
}
export function soraDependencyGuard(root) {
  return {
    name: 'reject-removed-sora-dependencies',
    buildStart() { auditSoraDependencyRemoval(root); },
    resolveId(id) { if (blocked.test(id)) throw new Error('Removed SORA dependency cannot be bundled'); },
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  auditSoraDependencyRemoval(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
  console.log('SORA dependency removal audit passed');
}
