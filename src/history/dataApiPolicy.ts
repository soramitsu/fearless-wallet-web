import type { AxiosRequestConfig } from 'axios';

export function dataApiUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error('unsafe_data_api_url');
  }
  return url;
}

export function dataApiRequestConfig(value: string): AxiosRequestConfig {
  dataApiUrl(value);
  // Fetch must reject redirects before a provider can forward wallet queries
  // or API credentials elsewhere. Axios' maxRedirects only covers Node HTTP.
  return { timeout: 10_000, adapter: 'fetch', fetchOptions: { redirect: 'error', credentials: 'omit' } };
}

export function getEthereumExplorerApiKey(value: string): string | undefined {
  const url = dataApiUrl(value);
  const keys: Record<string, string | undefined> = {
    'https://api.etherscan.io': process.env.FL_WEB_ETHERSCAN_API_KEY,
    'https://api.bscscan.com': process.env.FL_WEB_BSCSCAN_API_KEY,
    'https://api.polygonscan.com': process.env.FL_WEB_POLYGONSCAN_API_KEY,
    'https://api.arbiscan.io': process.env.FL_WEB_ARBISCAN_API_KEY,
    'https://api.snowtrace.io': process.env.FL_WEB_SNOWTRACE_API_KEY,
    'https://api-zkevm.polygonscan.com': process.env.FL_WEB_ZKEVM_POLYGONSCAN_API_KEY,
    'https://api-moonriver.moonscan.io': process.env.FL_BLAST_API_MOONRIVER_KEY,
    'https://api-moonbeam.moonscan.io': process.env.FL_BLAST_API_MOONBEAM_KEY,
  };
  return Object.hasOwn(keys, url.origin) ? keys[url.origin] : undefined;
}

export function oklinkApiHeaders(value: string): Record<string, string> {
  const url = dataApiUrl(value);
  if (url.origin !== 'https://www.oklink.com' || !url.pathname.startsWith('/api/v5/explorer/')) {
    throw new Error('unexpected_oklink_api_url');
  }
  const key = process.env.VUE_APP_FL_WEB_X1_TESTNET_API_KEY;
  return key ? { 'OK-ACCESS-KEY': key } : {};
}
