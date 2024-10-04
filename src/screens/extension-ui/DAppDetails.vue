<template>
  <div class="update-accounts">
    <SelectAuthAccount
      :selectAll="selectAll"
      :accounts="state"
      :authType="authType"
      :showSelectAll="showSelectAll"
      @onSelectAll="onSelectAll"
      @onSelect="onSelect"
    />

    <FButton class="connect-button" width="100%" size="big" fontSize="big" :text="buttonText" @click="updateAuths" />
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, set, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router/composables';
import type { AuthType } from '@extension-base/background/types/types';
import { updateAuthorization } from '@/extension/messaging';
import SelectAuthAccount from '@/screens/extension-ui/authorize/SelectAuthAccount.vue';
import { type WalletInfo, useStore } from '@/store';
import { GettersTypes as AccountsGetterType } from '@/store/accounts/getters';
import { GettersTypes as ExtensionGettersTypes } from '@/store/extension/getters';

const router = useRouter();
const route = useRoute();
const store = useStore();

const selectAll = ref(false);
const state = ref<Record<string, WalletInfo>>({});

const authType = computed(() => (route.params.type ?? 'substrate') as AuthType);
const isEVM = computed(() => authType.value === 'evm');
const showSelectAll = computed(() => authType.value !== 'evm');
const url = computed(() => route.params.id);

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
    .map(({ address, ethereumAddress }) => (isEVM.value ? ethereumAddress : address));
});

const isAllSelected = () => Object.values(state.value).every(({ active }) => active);
const list = computed(() => store.getters[ExtensionGettersTypes.authList]);

onMounted(async () => {
  await store.dispatch('GET_AUTHLIST');

  const wallets: WalletInfo[] = store.getters[AccountsGetterType.getWallets];

  const { authorizedAccounts, evmAuthorizedAccount } = list.value[url.value] ?? {};

  wallets.forEach(({ name, address, ethereumAddress, isMobile }) => {
    const isAuthorized = isEVM.value
      ? ethereumAddress === evmAuthorizedAccount
      : authorizedAccounts.some((el: string) => el === address);

    set(state.value, name, {
      name,
      isMobile,
      address,
      ethereumAddress,
      active: isAuthorized,
    });
  });

  selectAll.value = isAllSelected();
});

const onSelect = (value: boolean, name: string) => {
  if (showSelectAll.value) selectAll.value = selectAll.value = isAllSelected();
  else Object.keys(state.value).forEach((key) => (state.value[key].active = false));

  state.value[name].active = value;
};

const onSelectAll = (value: boolean) => {
  Object.keys(state.value).forEach((key) => {
    set(state.value, key, {
      ...state.value[key],
      active: value,
    });
  });

  selectAll.value = value;
};

const updateAuths = async () => {
  await updateAuthorization(prepAccounts.value, url.value, authType.value);
  await store.dispatch('GET_AUTHLIST');

  router.back();
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
