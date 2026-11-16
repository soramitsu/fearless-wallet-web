// The NODE_ENV of a build. This module imports nothing, so scripts/build-extension.mjs can decide NODE_ENV before it
// loads Vite and Vue (see pinBuildNodeEnv there).

export const BUILD_NODE_ENVS = Object.freeze(['production', 'development', 'test']);

/**
 * The NODE_ENV that every bundle of one build is compiled with. It picks the configuration a bundle reads
 * (IS_PRODUCTION in src/consts/global.ts: the chain list, the feature config, SORA's network and asset ids), so the
 * popup and the worker of one build must agree:
 * - `--mode production`, which every release build uses, is always `production`, whatever the environment says;
 * - any other mode keeps an explicit NODE_ENV (prepare:chrome-release builds its test extension with `test`, the
 *   dashboard smoke's test build asks for `production`), and is otherwise `test` for a test build (`--mode test` or
 *   VUE_APP_TEST_ONLY=true) and `development` for the rest.
 * scripts/build-extension.mjs writes the result to process.env before it loads Vite, so Vite itself (which gives an
 * unset NODE_ENV the value `production` during a build) and Vue's template compiler (which picks its development or
 * production build when it is first loaded) use it for every bundle too.
 */
export function resolveBuildNodeEnv(mode, env = process.env) {
  if (mode === 'production') return 'production';

  const requested = env.NODE_ENV ?? '';

  if (requested !== '') {
    if (!BUILD_NODE_ENVS.includes(requested)) {
      throw new Error(`NODE_ENV must be one of ${BUILD_NODE_ENVS.join(', ')}; received ${JSON.stringify(requested)}`);
    }

    return requested;
  }

  return mode === 'test' || env.VUE_APP_TEST_ONLY === 'true' ? 'test' : 'development';
}
