const { env } = require('process');
const packageJson = require('../../package.json');

const sanitizeVersionName = (value = '') =>
  value
    .trim()
    .replace(/[^0-9A-Za-z.-]/g, '-')
    .substring(0, 64);

const resolveVersionName = () => {
  const suffix =
    sanitizeVersionName(
      env.RELEASE_TAG || env.GIT_TAG_NAME || env.BUILD_TAG || env.BRANCH_NAME || env.BUILD_NUMBER || ''
    ) || '';
  return suffix ? `${packageJson.version}-${suffix}` : packageJson.version;
};

module.exports = (browser) => {
  const baseContentSecurityPolicy =
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; style-src 'unsafe-inline'; img-src 'self' https: data:; frame-src https:; frame-ancestors https:; connect-src https: wss: ws:; media-src https:";

  const firefoxBase = {
    manifest_version: 2,
    permissions: ['storage', 'tabs', 'identity', '*://www.googleapis.com/*', 'clipboardRead'],
    background: {
      scripts: ['background.js'],
      persistent: true,
    },
    browser_specific_settings: {
      gecko: {
        id: '{6a9332b9-e864-4d0a-a591-140fe75a29ba}',
      },
    },
    browser_action: {
      default_title: 'Fearless Wallet',
      default_popup: 'popup.html#/',
    },
    web_accessible_resources: ['page.js'],
    content_security_policy: baseContentSecurityPolicy,
  };

  const chromiumBase = {
    manifest_version: 3,
    permissions: ['storage', 'tabs', 'identity', 'clipboardRead'],
    background: {
      service_worker: 'background.js',
      type: 'module',
    },
    action: {
      default_title: 'Fearless Wallet',
      default_popup: 'popup.html#/',
    },
    host_permissions: ['<all_urls>'],
    key: env.EXTENSION_PUBLIC_KEY?.replace(/ /g, '') ?? '',
    oauth2: {
      scopes: ['https://www.googleapis.com/auth/drive.appdata'],
      client_id: env.OAUTH_CLIENT_ID,
    },
    minimum_chrome_version: '92',
    content_security_policy: {
      extension_pages: baseContentSecurityPolicy,
    },
    ...(env.CRX_UPDATE_URL ? { update_url: env.CRX_UPDATE_URL } : {}),
  };

  return {
    version: packageJson.version,
    version_name: resolveVersionName(),
    description: packageJson.description,
    homepage_url: 'https://fearlesswallet.io/',
    name: 'Fearless Wallet',
    short_name: 'FW',
    author: 'Soramitsu',
    icons: {
      16: 'icons/logo-16.png',
      32: 'icons/logo-32.png',
      48: 'icons/logo-48.png',
      64: 'icons/logo-64.png',
      128: 'icons/logo-128.png',
    },
    content_scripts: [
      {
        js: ['content.js'],
        matches: ['https://*/*', 'http://*/*'],
        run_at: 'document_start',
      },
    ],
    web_accessible_resources: [
      {
        resources: ['page.js'],
        matches: ['https://*/*', 'http://*/*', 'http://localhost/*'],
      },
    ],
    ...(browser === 'chrome' ? chromiumBase : firefoxBase),
  };
};
