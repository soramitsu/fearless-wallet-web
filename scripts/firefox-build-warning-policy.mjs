import path from 'node:path';

const POLKADOT_PACKAGE_INFO_PATH = /(?:^|\/)node_modules\/@polkadot\/[^/]+\/packageInfo\.js$/u;
const PACKAGE_INFO_PATH_EXPRESSION =
  "(import.meta && import.meta.url) ? new URL(import.meta.url).pathname.substring(0, new URL(import.meta.url).pathname.lastIndexOf('/') + 1) : 'auto'";

const X_GLOBAL_ANNOTATION =
  '[INVALID_ANNOTATION] A comment "/*#__PURE__*/" in "node_modules/@polkadot/x-global/index.js" contains an annotation that Rolldown cannot interpret due to the position of the comment.';
const VUEUSE_ANNOTATION =
  '[INVALID_ANNOTATION] A comment "/* #__PURE__ */" in "node_modules/@vueuse/core/dist/index.js" contains an annotation that Rolldown cannot interpret due to the position of the comment.';
const OX_BASE64_ANNOTATION =
  '[INVALID_ANNOTATION] A comment "/*#__PURE__*/" in "node_modules/ox/_esm/core/Base64.js" contains an annotation that Rolldown cannot interpret due to the position of the comment.';

const REVIEWED_INVALID_ANNOTATIONS = {
  popup: new Map([
    ['node_modules/@polkadot/x-global/index.js:9:23', X_GLOBAL_ANNOTATION],
    ['node_modules/@vueuse/core/dist/index.js:3362:0', VUEUSE_ANNOTATION],
    ['node_modules/@vueuse/core/dist/index.js:5780:22', VUEUSE_ANNOTATION],
  ]),
  background: new Map([
    ['node_modules/@polkadot/x-global/index.js:9:23', X_GLOBAL_ANNOTATION],
    ['node_modules/ox/_esm/core/Base64.js:6:27', OX_BASE64_ANNOTATION],
  ]),
  content: new Map([['node_modules/@polkadot/x-global/index.js:9:23', X_GLOBAL_ANNOTATION]]),
  page: new Map([['node_modules/@polkadot/x-global/index.js:9:23', X_GLOBAL_ANNOTATION]]),
};

function fail(message) {
  throw new Error(`[firefox-build-warning-policy] ${message}`);
}

function relativePosix(rootDir, id) {
  if (typeof id !== 'string' || id.length === 0) return null;

  const relative = path.relative(rootDir, id).split(path.sep).join('/');
  if (relative === '..' || relative.startsWith('../') || path.posix.isAbsolute(relative)) {
    fail(`warning source escapes the repository: ${id}`);
  }
  return relative;
}

function warningSummary(message) {
  if (typeof message !== 'string' || message.length === 0) return '';

  return (
    message
      .replace(/\u001b\[[0-9;]*m/gu, '')
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find(Boolean) ?? ''
  );
}

export function canonicalFirefoxBuildWarning(log, rootDir) {
  if (!log || typeof log !== 'object' || Array.isArray(log)) {
    fail('build warning must be an object');
  }

  return {
    code: typeof log.code === 'string' ? log.code : null,
    id: relativePosix(rootDir, log.id),
    line: Number.isSafeInteger(log.loc?.line) ? log.loc.line : null,
    column: Number.isSafeInteger(log.loc?.column) ? log.loc.column : null,
    plugin: typeof log.plugin === 'string' ? log.plugin : null,
    summary: warningSummary(log.message),
  };
}

export function isReviewedFirefoxBuildWarning(buildTarget, warning) {
  const reviewedAnnotations = REVIEWED_INVALID_ANNOTATIONS[buildTarget];
  if (!reviewedAnnotations) fail(`unknown Firefox build target ${String(buildTarget)}`);

  if (warning.code === 'INVALID_ANNOTATION') {
    return reviewedAnnotations.get(`${warning.id}:${warning.line}:${warning.column}`) === warning.summary;
  }

  if (warning.code === 'INEFFECTIVE_DYNAMIC_IMPORT') {
    return (
      buildTarget === 'popup' &&
      warning.id === 'src/screens/extension-ui/ManageAuths.vue' &&
      warning.summary ===
        '[INEFFECTIVE_DYNAMIC_IMPORT] src/screens/extension-ui/ManageAuths.vue is dynamically imported by src/router/routes.ts but also statically imported by src/screens/main/Main.vue?vue&type=script&lang.ts, dynamic import will not move module into another chunk.'
    );
  }

  if (warning.code === 'PLUGIN_TIMINGS') {
    return warning.summary === '[PLUGIN_TIMINGS] Your build spent significant time in plugins. Here is a breakdown:';
  }

  if (warning.plugin === 'builtin:vite-reporter') {
    return warning.summary === '(!) Some chunks are larger than 500 kB after minification. Consider:';
  }

  return false;
}

export function createFirefoxBuildWarningHandler({ buildTarget, rootDir, onReviewed = () => {} }) {
  if (!REVIEWED_INVALID_ANNOTATIONS[buildTarget]) {
    fail(`unknown Firefox build target ${String(buildTarget)}`);
  }
  if (typeof onReviewed !== 'function') fail('onReviewed must be a function');

  return (level, log, handler) => {
    if (typeof handler !== 'function') fail('Rolldown log handler must be a function');
    if (level !== 'warn') {
      handler(level, log);
      return;
    }

    const warning = canonicalFirefoxBuildWarning(log, rootDir);
    if (!isReviewedFirefoxBuildWarning(buildTarget, warning)) {
      fail(`unreviewed ${buildTarget} warning: ${JSON.stringify(warning)}`);
    }

    // Preserve the warning in build output. Review is a gate, not suppression.
    onReviewed(log);
    handler(level, log);
  };
}

export function createFirefoxBuildLogPolicy({ buildTarget, rootDir, baseLogger }) {
  if (!baseLogger || typeof baseLogger.warn !== 'function' || typeof baseLogger.warnOnce !== 'function') {
    fail('base Vite logger must expose warn and warnOnce');
  }

  const forwardedWarningSummaries = [];
  const onLog = createFirefoxBuildWarningHandler({
    buildTarget,
    rootDir,
    onReviewed(log) {
      forwardedWarningSummaries.push(warningSummary(log.message));
    },
  });

  const forwardReviewed = (method, message, options) => {
    const summary = warningSummary(message);
    const reviewedIndex = forwardedWarningSummaries.indexOf(summary);
    if (reviewedIndex === -1) {
      fail(`unreviewed ${buildTarget} Vite warning: ${JSON.stringify(summary)}`);
    }
    forwardedWarningSummaries.splice(reviewedIndex, 1);
    baseLogger[method](message, options);
  };

  return {
    onLog,
    logger: {
      ...baseLogger,
      warn(message, options) {
        forwardReviewed('warn', message, options);
      },
      warnOnce(message, options) {
        forwardReviewed('warnOnce', message, options);
      },
    },
  };
}

export function normalizePolkadotPackageInfoForIife(source, id) {
  const normalizedId = typeof id === 'string' ? id.split(path.sep).join('/') : '';
  if (!POLKADOT_PACKAGE_INFO_PATH.test(normalizedId) || !source.includes('import.meta')) return null;

  const first = source.indexOf(PACKAGE_INFO_PATH_EXPRESSION);
  const last = source.lastIndexOf(PACKAGE_INFO_PATH_EXPRESSION);
  if (first === -1 || first !== last) {
    fail(`unexpected import.meta usage in ${normalizedId}`);
  }

  const code = source.replace(PACKAGE_INFO_PATH_EXPRESSION, "'auto'");
  if (code.includes('import.meta')) {
    fail(`unreviewed import.meta usage remains in ${normalizedId}`);
  }

  return { code, map: null };
}

export function polkadotIifePackageInfoPlugin() {
  return {
    name: 'fearless-polkadot-iife-package-info',
    enforce: 'pre',
    transform(source, id) {
      return normalizePolkadotPackageInfoForIife(source, id);
    },
  };
}
