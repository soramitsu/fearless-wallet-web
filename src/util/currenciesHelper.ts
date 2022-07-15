import { ETHEREUM_NETWORKS } from '@/consts/ethereumNetworks';
import { Currency, Currencies } from '@/interfaces/currencies';
import { SelectedWallet } from '@/store/accounts/types';
import CurrencyController from '@/controllers/currencyController';
import keyring from '@polkadot/ui-keyring';
import { Networks } from '@/store/networks/types';

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
    return new CurrencyController({
      availableInNetworks: [],
      mainNetwork: name,
      price: 0,
      token: assets[0]?.assetId,
      usd24HoursChange: 0,
      precision: 0,
    });
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
