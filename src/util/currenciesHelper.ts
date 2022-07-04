import CurrencyController from '@/controllers/currencyController';
import keyring from '@polkadot/ui-keyring';
import { Currencies, Currency } from '@/interfaces/currencies';
import { ETHEREUM_NETWORKS } from '@/consts/ethereumNetworks';
import type { Networks } from '@/store/networks/types';
import type { SelectedWallet } from '@/store/accounts/types';

export function getCurrencies(currency: Currency[], { address, ethereumAddress }: SelectedWallet) {
  const substrate = currency.filter(({ mainNetwork }) => !ETHEREUM_NETWORKS.includes(mainNetwork));
  const ethereum = currency.filter(({ mainNetwork }) => ETHEREUM_NETWORKS.includes(mainNetwork));

  return {
    [address]: substrate,
    [ethereumAddress]: ethereum,
  } as Currencies;
}

export function getMockCurrencies(networks: Networks): Currencies {
  const currencyArray: Currency[] = networks.map(({ name, assets }) => {
    return new CurrencyController(name, assets[0]?.assetId, 0, 0, 0, []);
  });

  const currencies: Currencies = {};
  const substrate = currencyArray.filter(({ mainNetwork }) => !ETHEREUM_NETWORKS.includes(mainNetwork));
  const ethereum = currencyArray.filter(({ mainNetwork }) => ETHEREUM_NETWORKS.includes(mainNetwork));

  keyring.getAccounts().forEach(({ address }) => {
    const { type } = keyring.getPair(address);

    currencies[address] = type === 'ethereum' ? ethereum : substrate;
  });

  return currencies;
}
