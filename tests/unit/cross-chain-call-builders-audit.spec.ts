import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Cross-chain and bridge calls are built only by the reviewed builder in src/cross-chain, behind the route table,
 * runtime pins, call layout, quote token and send journal. A call built anywhere else would bypass all of them, as the
 * removed legacy SORA and Liberland bridge builders did.
 */
const SOURCE = resolve(__dirname, '../../src');
const REVIEWED_BUILDER = 'cross-chain/';
const PALLETS = ['bridgeProxy', 'soraBridgeApp', 'xTokens', 'xcmPallet', 'polkadotXcm'];
const BUILDER = new RegExp(
  `\\btx\\s*(?:\\?\\.|\\.)\\s*(?:${PALLETS.join('|')})\\b|\\btx\\s*(?:\\?\\.)?\\[\\s*['"\`](?:${PALLETS.join('|')})['"\`]\\s*\\]`
);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);

    return /\.(?:[cm]?[jt]sx?|vue)$/.test(entry.name) ? [path] : [];
  });
}

describe('cross-chain call builders', () => {
  it('recognises the ways a pallet call is reached', () => {
    for (const code of [
      'api.tx.xcmPallet.limitedTeleportAssets(dest)',
      'this.api.tx.bridgeProxy.burn(network)',
      'api.tx?.polkadotXcm?.transferAssets',
      "api.tx['xTokens'].transfer",
      'tx . soraBridgeApp . burn',
    ]) {
      expect(BUILDER.test(code), code).toBe(true);
    }
    expect(BUILDER.test("api.tx.balances.transferKeepAlive(to, amount)")).toBe(false);
    expect(BUILDER.test("{ pallet: 'xcmPallet', call: 'limitedTeleportAssets' }")).toBe(false);
  });

  it('are built only in src/cross-chain', () => {
    const findings = sourceFiles(SOURCE).flatMap((path) => {
      const file = relative(SOURCE, path).split('\\').join('/');
      if (file.startsWith(REVIEWED_BUILDER)) return [];

      return readFileSync(path, 'utf8')
        .split('\n')
        .flatMap((line, index) => (BUILDER.test(line) ? [`src/${file}:${index + 1}: ${line.trim()}`] : []));
    });

    expect(findings).toEqual([]);
  });
});
