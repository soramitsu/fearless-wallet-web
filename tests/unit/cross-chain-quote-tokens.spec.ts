import {
  CROSS_CHAIN_QUOTE_TOKEN_TTL_MS,
  CrossChainQuoteTokens,
  crossChainQuoteTokens,
  type CrossChainQuoteBinding,
} from '@/cross-chain/quoteTokens';

const binding = (overrides: Partial<CrossChainQuoteBinding> = {}): CrossChainQuoteBinding => ({
  from: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
  to: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
  amount: '1.5',
  originNet: 'Polkadot',
  destinationNet: 'Polkadot Asset Hub',
  assetId: 'polkadot-dot',
  assetKey: 'asset-key',
  routeId: 'reviewed-v1:wallet-xcm:polkadot:asset-hub:polkadot-dot',
  routeProviderId: 'wallet-xcm',
  originFee: '0.0183',
  destinationFee: '0.001',
  executionFingerprint: 'quote-fingerprint',
  ...overrides,
});

describe('cross-chain quote tokens', () => {
  it('issues unpredictable tokens', () => {
    const first = crossChainQuoteTokens.issue(binding());
    const second = crossChainQuoteTokens.issue(binding());

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).not.toBe(first);
  });

  it('accepts a token once, for the binding it was issued for', () => {
    const tokens = new CrossChainQuoteTokens();
    const token = tokens.issue(binding());

    expect(() => tokens.consume(token, binding())).not.toThrow();
    expect(() => tokens.consume(token, binding())).toThrow('cross_chain_quote_token_unknown');
  });

  it.each([undefined, '', 42])('requires a token (%j)', (token) => {
    expect(() => new CrossChainQuoteTokens().consume(token, binding())).toThrow('cross_chain_quote_token_required');
  });

  it('refuses a token the background never issued', () => {
    expect(() => new CrossChainQuoteTokens().consume('ab'.repeat(32), binding())).toThrow(
      'cross_chain_quote_token_unknown'
    );
  });

  it.each([
    ['recipient', { to: '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy' }],
    ['amount', { amount: '1.50' }],
    ['route', { routeId: 'reviewed-v1:wallet-xcm:kusama:asset-hub:kusama-ksm' }],
    ['origin fee', { originFee: '0.0184' }],
    ['destination fee', { destinationFee: '0' }],
    ['fingerprint', { executionFingerprint: 'other' }],
    ['sender', { from: '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy' }],
  ])('refuses a send whose %s differs from the quote, and spends the token anyway', (_label, change) => {
    const tokens = new CrossChainQuoteTokens();
    const token = tokens.issue(binding());

    expect(() => tokens.consume(token, binding(change))).toThrow('cross_chain_quote_mismatch');
    expect(() => tokens.consume(token, binding())).toThrow('cross_chain_quote_token_unknown');
  });

  it('expires a token after its time box', () => {
    let now = 1_000;
    const tokens = new CrossChainQuoteTokens(() => now);
    const fresh = tokens.issue(binding());
    const stale = tokens.issue(binding());

    now += CROSS_CHAIN_QUOTE_TOKEN_TTL_MS - 1;
    expect(() => tokens.consume(fresh, binding())).not.toThrow();

    now += 1;
    expect(() => tokens.consume(stale, binding())).toThrow('cross_chain_quote_expired');
  });

  it('keeps only the latest quotes', () => {
    let counter = 0;
    const tokens = new CrossChainQuoteTokens(() => 0, () => `token-${counter++}`);
    const issued = Array.from({ length: 40 }, () => tokens.issue(binding()));

    expect(() => tokens.consume(issued[0], binding())).toThrow('cross_chain_quote_token_unknown');
    expect(() => tokens.consume(issued[39], binding())).not.toThrow();
  });
});
