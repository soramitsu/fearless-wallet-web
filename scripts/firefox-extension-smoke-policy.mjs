export class SmokeTimeoutError extends Error {
  constructor(label, timeoutMs) {
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = 'SmokeTimeoutError';
  }
}

export const VERIFIED_FIREFOX_VERSION = '152.0.4';
export const FIREFOX_CI_WORKFLOW_BLOCK = `      - name: Set up Firefox
        id: setup-firefox
        uses: browser-actions/setup-firefox@0bc507ddf224827e3b1af68e014d5e42ab93e795 # v1.7.2
        with:
          firefox-version: ${VERIFIED_FIREFOX_VERSION}

      - name: Firefox extension runtime and CSP smoke
        run: yarn test:smoke:firefox
        env:
          FIREFOX_BINARY: \${{ steps.setup-firefox.outputs.firefox-path }}`;

export function assertPinnedFirefoxVersion(version) {
  if (typeof version !== 'string' || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(version)) {
    throw new Error(
      `Firefox CI version must be an immutable numeric x.y.z release, received ${JSON.stringify(version)}`
    );
  }
  return version;
}

export function assertFirefoxWorkflowContract(workflow) {
  if (typeof workflow !== 'string' || workflow.split(FIREFOX_CI_WORKFLOW_BLOCK).length !== 2) {
    throw new Error('Firefox setup/version/path and runtime smoke steps must remain one exact contiguous CI block');
  }
}

export function requireCiFirefoxBinary(environment) {
  if (environment?.GITHUB_ACTIONS !== 'true') return null;
  const candidate = environment.FIREFOX_BINARY;
  if (
    typeof candidate !== 'string' ||
    candidate.length === 0 ||
    candidate.length > 4_096 ||
    !candidate.startsWith('/') ||
    /[\0\r\n]/u.test(candidate)
  ) {
    throw new Error('GitHub Actions must provide one absolute FIREFOX_BINARY from the pinned setup-firefox step');
  }
  return candidate;
}

export function assertFirefoxVersionResult(result, expectedVersion = VERIFIED_FIREFOX_VERSION) {
  assertPinnedFirefoxVersion(expectedVersion);
  if (!result || typeof result !== 'object') throw new Error('Firefox --version did not return a process result');
  if (result.error) throw new Error(`Firefox --version failed to execute: ${String(result.error.message ?? result.error)}`);
  if (result.signal) throw new Error(`Firefox --version terminated by signal ${String(result.signal)}`);
  if (result.status !== 0) throw new Error(`Firefox --version exited ${String(result.status)}`);
  if (typeof result.stdout !== 'string' || typeof result.stderr !== 'string') {
    throw new Error('Firefox --version output was not text');
  }
  const output = `${result.stdout}\n${result.stderr}`;
  if (output.length > 64 * 1_024) throw new Error('Firefox --version output exceeded its bound');
  const reportedVersions = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('Mozilla Firefox '));
  if (reportedVersions.length !== 1) {
    throw new Error(`Firefox --version must report exactly one Mozilla Firefox version line, found ${reportedVersions.length}`);
  }
  const expectedLine = `Mozilla Firefox ${expectedVersion}`;
  if (reportedVersions[0] !== expectedLine) {
    throw new Error(`Firefox executable version mismatch: expected ${expectedLine}, received ${reportedVersions[0]}`);
  }
  return expectedVersion;
}

export class BoundedOutput {
  constructor(maximumCharacters = 2 * 1_024 * 1_024) {
    if (!Number.isSafeInteger(maximumCharacters) || maximumCharacters < 1) {
      throw new TypeError('maximumCharacters must be a positive safe integer');
    }
    this.maximumCharacters = maximumCharacters;
    this.value = '';
    this.truncated = false;
  }

  append(chunk) {
    this.value += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    if (this.value.length > this.maximumCharacters) {
      this.value = this.value.slice(-this.maximumCharacters);
      this.truncated = true;
    }
    return this.value;
  }

  toString() {
    return `${this.truncated ? '[earlier Firefox output truncated]\n' : ''}${this.value}`;
  }
}

export function withTimeout(operation, timeoutMs, label, onTimeout = () => {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new TypeError('timeoutMs must be a positive safe integer');
  }
  if (typeof label !== 'string' || label.length === 0) {
    throw new TypeError('timeout label must be a non-empty string');
  }

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new SmokeTimeoutError(label, timeoutMs));
      try {
        onTimeout();
      } catch {
        // The timeout remains the primary failure. The owned process/RDP
        // connection is force-cleaned again by the caller's finally block.
      }
    }, timeoutMs);
  });

  return Promise.race([Promise.resolve(operation), timeout]).finally(() => clearTimeout(timer));
}

export function isPopupUrl(candidate, popupPrefix) {
  return candidate === popupPrefix || candidate?.startsWith(`${popupPrefix}#`) === true;
}

export function assertPopupState(state, popupPrefix) {
  if (!state || typeof state !== 'object') throw new Error('popup state was not an object');
  if (state.readyState !== 'complete') throw new Error(`popup readyState was ${JSON.stringify(state.readyState)}`);
  if (!state.title?.startsWith('FEARLESS')) throw new Error(`popup title was ${JSON.stringify(state.title)}`);
  if (!isPopupUrl(state.href, popupPrefix))
    throw new Error(`popup URL escaped its extension page: ${JSON.stringify(state.href)}`);
  if (!state.app) throw new Error('popup #app root is missing');
  if (!state.vueMounted) throw new Error('Vue did not mark the popup root as mounted');
  if (!Number.isSafeInteger(state.appHtmlLength) || state.appHtmlLength < 100) {
    throw new Error(`popup #app did not render meaningful UI (${JSON.stringify(state.appHtmlLength)} bytes)`);
  }
  if (typeof state.body !== 'string' || state.body.trim().length < 20) {
    throw new Error(`popup body is unexpectedly empty: ${JSON.stringify(state.body)}`);
  }
  if (!Number.isSafeInteger(state.interactiveElements) || state.interactiveElements < 1) {
    throw new Error('popup rendered no interactive controls');
  }
}

export function assertCspState(state) {
  if (
    !state ||
    state.blocked !== true ||
    state.nativeFunction !== true ||
    state.name !== 'EvalError' ||
    typeof state.message !== 'string' ||
    state.message.length === 0
  ) {
    throw new Error(`Firefox extension CSP allowed dynamic Function execution: ${JSON.stringify(state)}`);
  }
}

export function findRuntimeErrors(output) {
  return output
    .split(/\r?\n/u)
    .filter((line) =>
      /JavaScript error:|console\.error:|Unhandled\s*Promise\s*Rejection|uncaught (?:exception|error)|WebExtension[^\n]*(?:error|failed)|Extension error:/iu.test(
        line
      )
    );
}

export function createSmokeEnvironment(environment) {
  const clean = { ...environment };
  for (const key of Object.keys(clean)) {
    if (key.startsWith('WEB_EXT_') || key === 'NODE_OPTIONS' || key === 'NODE_PATH') {
      delete clean[key];
    }
  }
  return clean;
}

export function processTreeExistsAfterProbeError(error) {
  if (error?.code === 'ESRCH') return false;
  if (error?.code === 'EPERM') return true;
  throw error;
}
