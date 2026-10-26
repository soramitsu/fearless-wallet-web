import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { mount } from '@vue/test-utils';
import { decodeIcon, ICON_DIRECTORY, ICON_PREFIX, iconProblems, REGISTRIES } from '../../scripts/sync-polkaswap-token-icons.mjs';
import { dashboardI18n } from './support/dashboardI18n';
import type { AggregateTokenRow } from '@/portfolio/dashboard/facets';
import { createAssetKey } from '@/portfolio/assetKey';
import { SORA_CHAIN_ID } from '@/portfolio/dashboard/readiness';
import { rowIcon, tokenIcon, type NetworkOf } from '@/portfolio/dashboard/tokenIcons';
import { POLKASWAP_TOKEN_ICONS } from '@/portfolio/polkaswapTokenIcons';

vi.mock('@/locales/useI18n', () => ({ useI18n: () => dashboardI18n }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ fiatSymbol: '$' }) }));
vi.mock('@/portfolio/usePortfolioFormatting', () => ({
  usePortfolioFormatting: () => ({ formatAmount: (value: string) => value, formatFiatValue: (value: string) => `$${value}` }),
}));

import PortfolioAllWallets from '@/screens/portfolio/PortfolioAllWallets.vue';

const XOR = '0x0200000000000000000000000000000000000000000000000000000000000000';
const VAL = '0x0200040000000000000000000000000000000000000000000000000000000000';
const UNLISTED = '0x00ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

const asset = (id: string, type: string, currencyId: string | undefined, symbol: string) => ({
  id,
  type,
  currencyId,
  symbol,
  icon: `registry-${id}.svg`,
});
const NETWORKS: Record<string, { chainId: string; assets: ReturnType<typeof asset>[] }> = {
  'SORA Mainnet': {
    chainId: SORA_CHAIN_ID,
    assets: [asset('xor-id', 'soraAsset', XOR, 'XOR'), asset('val-id', 'soraAsset', VAL, 'VAL'), asset('new-id', 'soraAsset', UNLISTED, 'NEW')],
  },
  // A token that borrows XOR's symbol, and even its on-chain id, on another network; and USDC, whose registry id is
  // checksummed while holding keys lowercase EVM ids.
  Ethereum: {
    chainId: '1',
    assets: [asset('0xfake', 'erc20', XOR, 'XOR'), asset('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'erc20', undefined, 'USDC')],
  },
  // A SORA asset whose id is a key every plain object has.
  'Odd SORA': { chainId: 'odd', assets: [asset('odd-id', 'soraAsset', 'constructor', 'ODD')] },
};
// Registry assets carry only what a logo is chosen by.
const networkOf = ((name: string) => NETWORKS[name]) as unknown as NetworkOf;
const holding = (networkName: string, assetId: string) => ({
  key: createAssetKey({ ecosystem: networkName === 'Ethereum' ? 'evm' : 'substrate', chainId: NETWORKS[networkName]?.chainId ?? 'none', assetId }),
  networkName,
});

describe('a holding\'s logo', () => {
  it('is the one polkaswap.io shows for a SORA asset, found by its on-chain id', () => {
    expect(tokenIcon(holding('SORA Mainnet', 'xor-id'), networkOf)).toBe(POLKASWAP_TOKEN_ICONS.get(XOR));
    expect(tokenIcon(holding('SORA Mainnet', 'val-id'), networkOf)).toBe(POLKASWAP_TOKEN_ICONS.get(VAL));
    expect(POLKASWAP_TOKEN_ICONS.get(XOR)).not.toBe(POLKASWAP_TOKEN_ICONS.get(VAL));
  });

  it('is the registry\'s for a SORA asset Polkaswap does not list, and for every other network', () => {
    expect(tokenIcon(holding('SORA Mainnet', 'new-id'), networkOf)).toBe('registry-new-id.svg');
    expect(tokenIcon(holding('Ethereum', '0xfake'), networkOf)).toBe('registry-0xfake.svg');
    expect(tokenIcon(holding('Odd SORA', 'odd-id'), networkOf)).toBe('registry-odd-id.svg');
  });

  it('finds an EVM token whatever the case of its contract id', () => {
    const usdc = holding('Ethereum', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');

    expect(usdc.key).toContain('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
    expect(tokenIcon(usdc, networkOf)).toBe('registry-0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48.svg');
  });

  it('is nothing when the registry has no such asset or network, or the key names nothing', () => {
    expect(tokenIcon(holding('SORA Mainnet', 'XOR'), networkOf)).toBe('');
    expect(tokenIcon(holding('Kusama', 'ksm'), networkOf)).toBe('');
    expect(tokenIcon({ key: 'not-a-key', networkName: 'SORA Mainnet' }, networkOf)).toBe('');
  });

  it('for a row is that of its largest holding that has one', () => {
    expect(rowIcon([holding('Kusama', 'ksm'), holding('SORA Mainnet', 'val-id'), holding('SORA Mainnet', 'xor-id')], networkOf)).toBe(
      POLKASWAP_TOKEN_ICONS.get(VAL)
    );
    expect(rowIcon([holding('Kusama', 'ksm')], networkOf)).toBe('');
    expect(rowIcon([], networkOf)).toBe('');
  });
});

describe('the bundled Polkaswap logos', () => {
  const directory = path.resolve(ICON_DIRECTORY);
  const files = readdirSync(directory).filter((name) => name.startsWith(ICON_PREFIX));
  const soraIds = new Set<string>(
    REGISTRIES.flatMap((file: string) =>
      (JSON.parse(readFileSync(path.resolve(file), 'utf8')) as Array<{ assets: Array<{ type?: string; currencyId?: string }> }>).flatMap(
        ({ assets }) => assets.filter(({ type, currencyId }) => type === 'soraAsset' && currencyId).map(({ currencyId }) => currencyId as string)
      )
    )
  );

  it('cover every SORA asset the registry lists, one file each', () => {
    expect(soraIds.size).toBeGreaterThan(30);
    expect([...soraIds].filter((id) => !POLKASWAP_TOKEN_ICONS.has(id))).toEqual([]);
    expect([...POLKASWAP_TOKEN_ICONS.keys()].filter((id) => !soraIds.has(id))).toEqual([]);
    expect(new Set(POLKASWAP_TOKEN_ICONS.values()).size).toBe(POLKASWAP_TOKEN_ICONS.size);
    expect(files).toHaveLength(POLKASWAP_TOKEN_ICONS.size);
  });

  it('are plain PNG or SVG that load nothing and run nothing', () => {
    for (const name of files) {
      expect([name, iconProblems(readFileSync(path.join(directory, name)), path.extname(name).slice(1))]).toEqual([name, []]);
    }
  });
});

describe('the sync script\'s checks', () => {
  const svg = (body: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">${body}</svg>`);

  it('accept shapes, gradients, styles and references inside the document', () => {
    expect(iconProblems(svg('<defs><linearGradient id="a"/></defs><style>.b{fill:url(#a)}</style><use href="#a"/>'), 'svg')).toEqual([]);
  });

  it.each([
    ['a script', '<script>alert(1)</script>'],
    ['an event handler', '<circle onload="alert(1)"/>'],
    ['foreign content', '<foreignObject><div/></foreignObject>'],
    ['an embedded image', '<image href="data:image/png;base64,AA=="/>'],
    ['an outside reference', '<use href="https://example.com/a.svg#b"/>'],
    ['an outside style', '<style>@import "https://example.com/a.css";</style>'],
    ['another host', '<g xmlns:x="http://ns.example.org/x"/>'],
  ])('refuse an SVG with %s', (_, body) => {
    expect(iconProblems(svg(body), 'svg')).not.toEqual([]);
  });

  it('refuse bytes that are not the type they claim, and other types', () => {
    expect(iconProblems(Buffer.from('<svg/>'), 'png')).toEqual(['not a PNG']);
    expect(iconProblems(Buffer.from('GIF89a'), 'gif')).toEqual(['unsupported type gif']);
    expect(iconProblems(Buffer.from('<html/>'), 'svg')).toEqual(['no <svg> element']);
  });

  it('decode the whitelist\'s SVG and PNG data URIs, and nothing else', () => {
    expect(decodeIcon("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E")).toEqual({
      extension: 'svg',
      bytes: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"),
    });
    expect(decodeIcon('data:image/png;base64,iVBORw0KGgo=').bytes.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(() => decodeIcon('data:text/html,<script>alert(1)</script>')).toThrow('not an SVG or PNG data URI');
  });
});

describe('All wallets token rows', () => {
  const child = (id: string, symbol: string) => ({
    holdingId: `main|${id}`,
    key: id,
    address: 'main',
    walletName: 'Main',
    networkName: 'SORA Mainnet',
    symbol,
    amount: '1',
    fiat: '1',
    changePercent: null,
  });
  const row = (id: string, symbol: string): AggregateTokenRow => ({
    id,
    symbol,
    name: symbol,
    fiat: '1',
    amount: '1',
    changePercent: null,
    networks: ['SORA Mainnet'],
    wallets: ['Main'],
    children: [child(id, symbol)],
  });
  const list = (extra: Record<string, unknown> = {}) =>
    mount(PortfolioAllWallets, {
      props: {
        lens: 'token',
        tokenRows: [row('xor', 'XOR'), row('pswap', 'PSWAP')],
        networkSections: [],
        wallets: [],
        slotOf: () => 1,
        activeKey: null,
        focus: null,
        loading: false,
        readinessOf: () => ({ state: 'none', hops: [] }),
        ...extra,
      },
      global: { stubs: { Icon: true, Shimmer: true, ExternalLogo: true, PortfolioReadinessChip: true } },
    });

  it('show a token\'s logo inside its ring, and its initials when it has none', () => {
    const wrapper = list({ iconOf: (token: AggregateTokenRow) => (token.id === 'xor' ? 'xor-logo.svg' : '') });
    const xor = wrapper.get('[data-testid="tokenRow-xor"] .orb');
    const pswap = wrapper.get('[data-testid="tokenRow-pswap"] .orb');

    expect(xor.get('external-logo-stub').attributes('name')).toBe('xor-logo.svg');
    expect(xor.text()).toBe('');
    expect(xor.attributes('style')).toContain('--orb');
    expect(pswap.find('external-logo-stub').exists()).toBe(false);
    expect(pswap.text()).toBe('PSWA');
    wrapper.unmount();
  });

  it('show initials when nothing names the logos', () => {
    const wrapper = list();

    expect(wrapper.findAll('external-logo-stub')).toHaveLength(0);
    expect(wrapper.findAll('.orb').map((orb) => orb.text())).toEqual(['XOR', 'PSWA']);
    wrapper.unmount();
  });
});
