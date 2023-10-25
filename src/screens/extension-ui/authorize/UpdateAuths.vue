<template>
  <div class="update-accounts">
    <SelectAuthAccount :selectAll="selectAll" :accounts="state" @onSelectAll="onSelectAll" @onSelect="onSelect" />

    <FButton class="connect-button" width="100%" size="big" fontSize="big" :text="buttonText" @click="updateAuths" />
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, set, ref } from 'vue';
import { useRoute } from 'vue-router/composables';
import type { AuthUrls } from '@extension-base/background/types';
import { updateAuthorization } from '@/extension/messaging';
import SelectAuthAccount from '@/screens/extension-ui/authorize/SelectAuthAccount.vue';
import { type WalletInfo, useStore } from '@/store';

const route = useRoute();
const store = useStore();

const list = ref<AuthUrls>({});
const selectAll = ref(false);
const state = ref<Record<string, WalletInfo>>({});

const emit = defineEmits(['onUpdate']);

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
    .map(({ address }) => address);
});

const isAllSelected = () => Object.values(state.value).every((value) => value.active === true);

onMounted(async () => {
  list.value = await store.dispatch('GET_AUTHLIST');

  const wallets: WalletInfo[] = store.getters.getWallets;

  const { authorizedAccounts } = list.value[url.value] ?? {};

  wallets.forEach(({ name, address, isMobile }) => {
    const isAuthorized = authorizedAccounts.some((el: string) => el === address);

    set(state.value, name, {
      name: name,
      address: address,
      isMobile: isMobile,
      active: isAuthorized,
    });
  });

  selectAll.value = isAllSelected();
});

const onSelect = (value: boolean, name: string) => {
  state.value[name].active = value;
  selectAll.value = isAllSelected();
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
  await updateAuthorization(prepAccounts.value, url.value);
  list.value = await store.dispatch('GET_AUTHLIST');

  emit('onUpdate');
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
