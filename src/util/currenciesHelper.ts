import CurrencyController from '@/controllers/currencyController';
import keyring from '@polkadot/ui-keyring';
import { ETHEREUM_NETWORKS } from '@/consts/ethereumNetworks';
import type { Currencies, Currency, CurrencyFields } from '@/interfaces/currencies';
import type { Networks } from '@/store/networks/types';
import type { SelectedWallet } from '@/store/accounts/types';

const mockBalance = {
  frozen: '0',
  locked: '0',
  reserved: '0',
  total: '0',
  transferable: '0',
};

export function getCurrencies(currency: Currency[], { address, ethereumAddress }: SelectedWallet) {
  const substrate = currency.filter(({ mainNetwork }) => !ETHEREUM_NETWORKS.includes(mainNetwork));
  const ethereum = currency.filter(({ mainNetwork }) => ETHEREUM_NETWORKS.includes(mainNetwork));

  return {
    [address]: substrate,
    [ethereumAddress]: ethereum,
  } as Currencies;
}

export function getMockCurrencies(networks: Networks): Currencies {
  const currencyArray: Currency[] = networks
    .reduce((result, network) => {
      const { assets, name } = network;
      const token = assets[0]?.assetId;
      const tokenIndex = result.findIndex(({ token: tokenExist }) => tokenExist === token);

      if (tokenIndex !== -1)
        result[tokenIndex].availableInNetworks.push({
          network: name,
          balance: mockBalance,
        });
      else
        result.push({
          mainNetwork: name,
          token,
          price: 0,
          precision: 0,
          usd24HoursChange: 0,
          availableInNetworks: [
            {
              network: name,
              balance: mockBalance,
            },
          ],
        });

      return result;
    }, [] as CurrencyFields[])
    .map(
      ({ mainNetwork, price, availableInNetworks, precision, token, usd24HoursChange }) =>
        new CurrencyController(mainNetwork, token, price, usd24HoursChange, precision, availableInNetworks)
    );

  const currencies: Currencies = {};
  const substrate = currencyArray.filter(({ mainNetwork }) => !ETHEREUM_NETWORKS.includes(mainNetwork));
  const ethereum = currencyArray.filter(({ mainNetwork }) => ETHEREUM_NETWORKS.includes(mainNetwork));

  keyring.getAccounts().forEach(({ address }) => {
    const { type } = keyring.getPair(address);

    currencies[address] = type === 'ethereum' ? ethereum : substrate;
  });

  return currencies;
}
