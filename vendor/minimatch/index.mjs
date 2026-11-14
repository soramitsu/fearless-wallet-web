export * from 'minimatch-upstream';

// minimatch 11 no longer builds regular expressions. eslint-plugin-import-x still imports makeRe for its
// no-internal-modules rule, which this project does not enable; the export lets the plugin load, and refuses.
export function makeRe() {
  throw new Error('minimatch makeRe is unavailable: minimatch 11 no longer builds regular expressions');
}
