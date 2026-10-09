import { createRequire } from 'node:module';
import nodeProcess from 'node:process';
import packageJson from '../../package.json';

const require = createRequire(import.meta.url);
const makeManifest = require('../../src/extension/makeManifest.cjs') as (browser: string) => Record<string, unknown>;

describe('extension manifest generation', () => {
  const originalPublicKey = nodeProcess.env.EXTENSION_PUBLIC_KEY;
  const originalOauthClientId = nodeProcess.env.OAUTH_CLIENT_ID;

  afterEach(() => {
    if (originalPublicKey === undefined) delete nodeProcess.env.EXTENSION_PUBLIC_KEY;
    else nodeProcess.env.EXTENSION_PUBLIC_KEY = originalPublicKey;

    if (originalOauthClientId === undefined) delete nodeProcess.env.OAUTH_CLIENT_ID;
    else nodeProcess.env.OAUTH_CLIENT_ID = originalOauthClientId;
  });

  it('generates a hardened chromium mv3 manifest', () => {
    nodeProcess.env.EXTENSION_PUBLIC_KEY = 'abc def ghi';
    nodeProcess.env.OAUTH_CLIENT_ID = 'oauth-client';

    const manifest = makeManifest('chrome');
    const csp = (manifest.content_security_policy as { extension_pages: string }).extension_pages;

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.version).toBe(packageJson.version);
    expect(manifest.description).toBe(packageJson.description);
    expect(manifest.background).toEqual({ service_worker: 'background.js', type: 'module' });
    expect(manifest).not.toHaveProperty('browser_action');
    expect(manifest.host_permissions).toEqual(['<all_urls>']);
    expect(manifest.permissions).toContain('alarms');
    expect(manifest.permissions).not.toContain('*://www.googleapis.com/*');
    expect(manifest.key).toBe('abcdefghi');
    expect(manifest.minimum_chrome_version).toBe('116');
    expect(manifest.oauth2).toEqual({
      scopes: ['https://www.googleapis.com/auth/drive.appdata'],
      client_id: 'oauth-client',
    });
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it('generates firefox mv3 shape without chromium-only keys', () => {
    const manifest = makeManifest('firefox');

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background).toEqual({ scripts: ['background.js'], type: 'module' });
    expect(manifest.host_permissions).toEqual(['<all_urls>']);
    expect(manifest.permissions).toContain('alarms');
    expect(manifest.permissions).not.toContain('*://www.googleapis.com/*');
    expect(manifest.browser_specific_settings).toEqual({
      gecko: {
        id: '{6a9332b9-e864-4d0a-a591-140fe75a29ba}',
        data_collection_permissions: {
          required: ['authenticationInfo', 'financialAndPaymentInfo', 'websiteActivity'],
        },
      },
    });
    expect(manifest).not.toHaveProperty('key');
    expect(manifest).not.toHaveProperty('oauth2');
    expect(manifest).not.toHaveProperty('minimum_chrome_version');
  });

  it('omits private chromium credentials for local open-source builds', () => {
    delete nodeProcess.env.EXTENSION_PUBLIC_KEY;
    delete nodeProcess.env.OAUTH_CLIENT_ID;

    const manifest = makeManifest('chrome');

    expect(manifest).not.toHaveProperty('key');
    expect(manifest).not.toHaveProperty('oauth2');
    expect(manifest.minimum_chrome_version).toBe('116');
  });

  it('exposes only expected runtime scripts to page contexts', () => {
    const manifest = makeManifest('chrome');

    expect(manifest.content_scripts).toEqual([
      {
        js: ['content.js'],
        matches: ['https://*/*', 'http://*/*'],
        run_at: 'document_start',
      },
    ]);
    expect(manifest.web_accessible_resources).toEqual([
      {
        resources: ['page.js'],
        matches: ['https://*/*', 'http://*/*', 'http://localhost/*'],
      },
    ]);
  });
});
