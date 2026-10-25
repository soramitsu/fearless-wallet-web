import { writeFileSync } from 'node:fs';
import path from 'node:path';

// Vue CLI's old thread-loader can deadlock on Vue TypeScript modules on newer
// hosts. Keep the released source and dependency graph intact; only run those
// same loaders in the compiler process. The normal production build, including
// type checking and minification, still runs.
export function serialVueBuildConfig(src) {
  const original = path.join(src, 'vue.config.extension.js');
  // The historical is-file-esm resolver requires a package.json ancestor.
  const config = path.join(src, '.upgrade-e2e-serial-vue.config.cjs');
  writeFileSync(config, `module.exports = { ...require(${JSON.stringify(original)}), parallel: false };\n`);
  return {
    args: [
      'exec',
      'env-cmd',
      '--no-override',
      '-f',
      '.env.extension',
      'vue-cli-service',
      '--env.NODE_ENV=production',
      'build',
    ],
    env: { VUE_CLI_SERVICE_CONFIG_PATH: config },
    deviation:
      'Vue CLI parallel=false via an external config wrapper; original source, lockfile, type checks and production optimizations preserved',
  };
}
