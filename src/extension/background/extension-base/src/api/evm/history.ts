import fetchAdapter from '@vespaiach/axios-fetch-adapter';
import axios from 'axios';
import { evmBlockExplorer } from '../../const';
import { DEFAULT_EVM_TOKENS } from '@/consts/networks';

export async function fetchHistory(address: string, chain: keyof typeof evmBlockExplorer, token?: string) {
  const url = new URL(`${evmBlockExplorer[chain]}/api`);
  url.searchParams.set('module', 'account');
  url.searchParams.set('action', `${token ? 'tokentx' : 'txlist'}`);

  if (token) {
    const smartContractAddress = DEFAULT_EVM_TOKENS.erc20.find((el) => el.symbol.toLowerCase() === token.toLowerCase());
    if (!smartContractAddress) throw Error('token symbol is wrong');

    url.searchParams.set('contractaddress', `${smartContractAddress.smartContract}`);
  }

  url.searchParams.set('address', address);
  url.searchParams.set('sort', 'asc');
  url.searchParams.set('apikey', 'ZWNEGMN2EBP34B8B25MQWGTBPSNZG4VBY1'); //impliment pick right api key for different services

  const data = await axios.get(url.href, {
    adapter: fetchAdapter,
  });

  return data;
}
