import type { TransformAccountPayload } from '@extension-base/background/types/types';
import type { InjectedAccount } from '@polkadot/extension-inject/types';
import type { SingleAddress } from '@subwallet/ui-keyring/observable/types';

export function transformAccounts({ accounts, accountAuthType }: TransformAccountPayload): InjectedAccount[] {
  const authTypeFilter = ({ type }: SingleAddress): boolean => {
    if (accountAuthType === 'substrate') return type !== 'ethereum';

    if (accountAuthType === 'evm') return type === 'ethereum';

    return true;
  };

  return Object.values(accounts)
    .filter(authTypeFilter)
    .sort((a, b) => (a.json.meta.whenCreated || 0) - (b.json.meta.whenCreated || 0))
    .map(
      ({
        json: {
          address,
          meta: { name },
        },
        type,
      }): InjectedAccount => ({ address, name, type })
    );
}

export function transformAddresses({ accounts, accountAuthType }: TransformAccountPayload): InjectedAccount[] {
  return Object.values(accounts)
    .sort((a, b) => (a.json.meta.whenCreated || 0) - (b.json.meta.whenCreated || 0))
    .map((item): InjectedAccount => {
      const {
        json: {
          address,
          meta: { name, ethereumAddress },
        },
        type,
      } = item;

      return {
        address: accountAuthType === 'evm' ? (ethereumAddress as string) : address,
        name,
        type,
        genesisHash: '',
      };
    });
}
