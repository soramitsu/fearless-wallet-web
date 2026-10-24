import { computed } from 'vue';
import { IS_EXTENSION } from '@/consts/global';
import { useAccountsStore } from '@/stores/accounts';
import { isSelectedWalletRecoveryOnly } from '@/util/walletRecoveryPolicy';

export function useWalletRecovery() {
  const accounts = useAccountsStore();
  return computed(() => IS_EXTENSION &&
    isSelectedWalletRecoveryOnly(accounts.accounts, accounts.selectedWallet.address));
}
