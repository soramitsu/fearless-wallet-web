import { beforeEach, describe, expect, it, vi } from 'vitest';
import { subwalletPackageCompatPlugin } from '../../scripts/subwallet-package-compat.mjs';
import { detectSubwalletPackage } from '@/util/detectSubwalletPackage';

beforeEach(() => {
  Reflect.deleteProperty(globalThis, Symbol.for('fearless.subwallet.packageVersions'));
});
describe('Subwallet package diagnostics', () => {
  it('accepts the fork version sequence without changing Polkadot registration', () => {
    expect(() =>
      detectSubwalletPackage({ name: '@subwallet/keyring', version: '0.1.14', path: 'test', type: 'esm' })
    ).not.toThrow();
    expect(() =>
      detectSubwalletPackage({ name: '@polkadot/keyring', version: '14', path: 'test', type: 'esm' })
    ).toThrow();
  });
  it('still warns about two different fork versions', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    detectSubwalletPackage({ name: '@subwallet/keyring', version: '0.1.14', path: 'one', type: 'esm' });
    detectSubwalletPackage({ name: '@subwallet/keyring', version: '0.1.15', path: 'two', type: 'esm' });
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
  });
  it('only rewrites the two known diagnostic entrypoints', () => {
    const plugin = subwalletPackageCompatPlugin();
    const code = "import { detectPackage } from '@polkadot/util';\ndetectPackage(packageInfo, null, others);";
    expect(plugin.transform(code, '/repo/node_modules/@subwallet/keyring/detectPackage.js')?.code).toContain(
      'detectSubwalletPackage'
    );
    expect(plugin.transform(code, '/repo/node_modules/@polkadot/keyring/detectPackage.js')).toBeNull();
    expect(plugin.transform(code, '/repo/node_modules/@subwallet/keyring/pair/index.js')).toBeNull();
    expect(() => plugin.transform('changed', '/repo/node_modules/@subwallet/ui-keyring/detectPackage.js')).toThrow();
  });
});
