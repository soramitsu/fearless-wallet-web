import { computed } from 'vue';
import type { WalletMetadataOptions, WalletMetadataIndex } from '@/helpers/currencies';
import { createWalletMetadataIndex } from '@/helpers/currencies';
import { useAccountsStore } from '@/stores/accounts';
import { useNetworksStore } from '@/stores/networks';

type WalletMetadataOptionsInput = Partial<WalletMetadataOptions> | (() => Partial<WalletMetadataOptions>);

const resolveOptions = (input?: WalletMetadataOptionsInput): Partial<WalletMetadataOptions> => {
  if (!input) return {};

  return typeof input === 'function' ? input() : input;
};

export const useWalletMetadata = (input?: WalletMetadataOptionsInput) => {
  const accountsStore = useAccountsStore();
  const networksStore = useNetworksStore();

  return computed<WalletMetadataIndex>(() => {
    const options = resolveOptions(input);

    return createWalletMetadataIndex({
      tokenGroups: options.tokenGroups ?? accountsStore.balances,
      fiats: options.fiats ?? networksStore.fiats,
      fiatFilter: options.fiatFilter ?? '',
      networks: options.networks ?? networksStore.networks,
      selection: options.selection ?? accountsStore.selectedNetwork,
      favoriteAddress: options.favoriteAddress ?? accountsStore.selectedWallet.address,
    });
  });
};

export type { WalletMetadataIndex };
