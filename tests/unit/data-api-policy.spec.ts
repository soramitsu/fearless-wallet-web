import { dataApiRequestConfig, getEthereumExplorerApiKey, oklinkApiHeaders } from '@/history/dataApiPolicy';
import { computedSubqueryRequest, computedGiantSquidRequest, computedSubsquidRequest, computedSoraRequest } from '@/history/requests';

describe('data API credential boundaries', () => {
  it('sends the explorer key only to the exact HTTPS origin', () => {
    // These values are replaced at build time by Vite; the adversarial run
    // supplies synthetic keys in the Vitest process environment.
    expect(getEthereumExplorerApiKey('https://api.etherscan.io/v2/api?chainid=1')).toBe(process.env.FL_WEB_ETHERSCAN_API_KEY);
    for (const url of [
      'https://api.etherscan.io.evil.example/api',
      'https://evil.example/etherscan/api',
      'https://evil.example/?provider=etherscan',
      'https://api.etherscan.io:8443/api',
    ]) expect(getEthereumExplorerApiKey(url)).toBeUndefined();
  });

  it('rejects OKLink credential forwarding to another provider', () => {
    expect(oklinkApiHeaders('https://www.oklink.com/api/v5/explorer/address/transaction-list?chainShortName=eth'))
      .toEqual(process.env.VUE_APP_FL_WEB_X1_TESTNET_API_KEY ? { 'OK-ACCESS-KEY': process.env.VUE_APP_FL_WEB_X1_TESTNET_API_KEY } : {});
    for (const url of [
      'https://evil.example/api/v5/explorer/address/transaction-list',
      'https://www.oklink.com.evil.example/api/v5/explorer/address/transaction-list',
      'https://www.oklink.com:8443/api/v5/explorer/address/transaction-list',
      'https://www.oklink.com/redirect',
    ]) expect(() => oklinkApiHeaders(url)).toThrow('unexpected_oklink_api_url');
  });

  it.each(['http://api.example/api', 'https://user:pass@api.example/api', 'https://api.example/api#fragment'])(
    'rejects unsafe data URLs: %s', (url) => expect(() => dataApiRequestConfig(url)).toThrow()
  );

  it('uses the fetch redirect policy and omits ambient cookies', () => {
    expect(dataApiRequestConfig('https://api.example/api')).toEqual({
      timeout: 10_000, adapter: 'fetch', fetchOptions: { redirect: 'error', credentials: 'omit' },
    });
  });
});

describe('legacy GraphQL request encoding', () => {
  const hostile = '") { injected: __typename } #\\\n';

  it('encodes remote cursors and addresses as string literals', () => {
    const query = computedSubqueryRequest(hostile, 100, hostile);
    expect(query).toContain(`after: ${JSON.stringify(hostile)}`);
    expect(query).toContain(`equalTo: ${JSON.stringify(hostile)}`);
    expect(query).not.toContain(`after: ${hostile}`);
    expect(computedSubqueryRequest(null, 100, 'address')).toContain('after: null');
  });

  it.each([computedGiantSquidRequest, computedSubsquidRequest, computedSoraRequest])('encodes history address filters', (query) => {
    expect(query(hostile)).toContain(JSON.stringify(hostile));
    expect(query(hostile)).not.toContain(`"${hostile}"`);
  });

  it.each([0, -1, 101, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects unbounded page sizes: %s', (size) => {
    expect(() => computedSubqueryRequest(null, size, 'address')).toThrow('invalid_history_page_size');
  });
});
