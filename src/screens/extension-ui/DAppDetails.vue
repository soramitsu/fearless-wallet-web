<template>
  <div class="update-accounts">
    <SelectAuthAccountForm
      :selectAll="selectAll"
      :accounts="state"
      :authType="authType"
      :showSelectAll="showSelectAll"
      @onSelectAll="onSelectAll"
      @onSelect="onSelect"
    />

    <FButton
      class="connect-button"
      width="100%"
      size="big"
      fontSize="big"
      :disabled="isDisabledApproveBtn"
      :text="buttonText"
      @click="updateAuths"
    />
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { AuthType } from '@extension-base/background/types/types';
import type { WalletInfo } from '@/stores';
import { updateAuthorization } from '@/extension/messaging';
import SelectAuthAccountForm from '@/screens/extension-ui/authorize/SelectAuthAccountForm.vue';
import { useExtensionStore } from '@/stores/extension';
import { useAccountsStore } from '@/stores/accounts';
import { WalletEcosystem } from '@/interfaces';
import { encodeIrohaI105Address } from '@/util/iroha';

type IrohaAuthAccount = {
  address: string;
  irohaAddress?: string;
  irohaPublicKeyHex?: string;
  walletEcosystem?: WalletEcosystem;
};

const router = useRouter();
const route = useRoute();
const extensionStore = useExtensionStore();
const accountsStore = useAccountsStore();

const selectAll = ref(false);
const state = ref<Record<string, WalletInfo>>({});

const routeParam = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] ?? '' : value ?? '');

const authType = computed(() => (routeParam(route.params.type) || 'substrate') as AuthType);
const isEVM = computed(() => authType.value === 'evm');
const isSolana = computed(() => authType.value === 'solana');
const isIroha = computed(() => authType.value === 'iroha');
const showSelectAll = computed(() => authType.value !== 'evm' && authType.value !== 'solana' && authType.value !== 'iroha');
const url = computed(() => routeParam(route.params.id));
const isDisabledApproveBtn = computed(() => !Object.values(state.value).some(({ active }) => active));

const buttonText = computed(() => {
  const count = Object.values(state.value).filter((el) => el.active).length;
  const tc = count === 1 ? 1 : 2;

  return {
    text: 'authorize.connectCountAccounts',
    localeProps: { count, tc },
  };
});

const prepAccounts = computed<string[]>(() => {
  return Object.values(state.value)
    .filter(({ active }) => active)
    .map(({ address, ethereumAddress, irohaAddress, solanaAddress }) =>
      isEVM.value ? ethereumAddress : isSolana.value ? solanaAddress ?? address : isIroha.value ? irohaAddress ?? address : address
    );
});

const list = computed(() => extensionStore.authList);

const isAllSelected = () => Object.values(state.value).every(({ active }) => active);

onMounted(async () => {
  await extensionStore.getAuthList();

  const { authorizedAccounts, evmAuthorizedAccount, irohaAuthorizedAccount, solanaAuthorizedAccount } =
    list.value[url.value] ?? {};
  const allowedIroha = new Set(irohaAuthorizedAccount ? [irohaAuthorizedAccount] : []);

  accountsStore.accounts.forEach((account) => {
    const { name, address, ethereumAddress, irohaAddress, isMobile, solanaAddress, walletEcosystem } = account;
    const authAddress = isSolana.value
      ? solanaAddress ?? address
      : isIroha.value
      ? resolveIrohaAuthAddress(account, allowedIroha) ?? address
      : address;

    if (isSolana.value && !solanaAddress && walletEcosystem !== WalletEcosystem.Solana) return;
    if (isIroha.value && !resolveIrohaAuthAddress(account, allowedIroha)) return;

    const isAuthorized = isEVM.value
      ? ethereumAddress === evmAuthorizedAccount
      : isSolana.value
      ? authAddress === solanaAuthorizedAccount
      : isIroha.value
      ? authAddress === irohaAuthorizedAccount
      : authorizedAccounts.some((el: string) => el === address);

    state.value[authAddress] = {
      name,
      isMobile,
      address: authAddress,
      ethereumAddress,
      irohaAddress: isIroha.value ? authAddress : irohaAddress,
      solanaAddress,
      active: isAuthorized,
    };
  });

  selectAll.value = isAllSelected();
});

const onSelect = (value: boolean, address: string) => {
  if (!showSelectAll.value) Object.keys(state.value).forEach((key) => (state.value[key].active = false));

  state.value[address].active = value;

  if (showSelectAll.value) selectAll.value = isAllSelected();
};

const onSelectAll = (value: boolean) => {
  Object.keys(state.value).forEach((key) => {
    state.value[key] = {
      ...state.value[key],
      active: value,
    };
  });

  selectAll.value = value;
};

const updateAuths = async () => {
  await updateAuthorization(prepAccounts.value, url.value, authType.value);
  await extensionStore.getAuthList();

  router.back();
};

const resolveIrohaAuthAddress = (
  {
    address,
    irohaAddress,
    irohaPublicKeyHex,
    walletEcosystem,
  }: IrohaAuthAccount,
  allowed: Set<string>
): string | undefined => {
  const candidates = [
    irohaAddress,
    address,
    ...deriveIrohaAddresses(irohaPublicKeyHex),
  ].filter((value): value is string => !!value);

  if (allowed.size > 0) return candidates.find((candidate) => allowed.has(candidate));

  return walletEcosystem === WalletEcosystem.Iroha ? candidates[0] : irohaAddress;
};

const deriveIrohaAddresses = (publicKeyHex?: string): string[] => {
  if (!publicKeyHex) return [];

  try {
    return [encodeIrohaI105Address(publicKeyHex, 'nexus'), encodeIrohaI105Address(publicKeyHex, 'taira')];
  } catch {
    return [];
  }
};
</script>

<style lang="scss" scoped>
.update-accounts {
  display: flex;
  flex-flow: column;
  justify-content: space-between;
  height: 100%;
}

.connect-button {
  margin-top: 16px;
}
</style>
