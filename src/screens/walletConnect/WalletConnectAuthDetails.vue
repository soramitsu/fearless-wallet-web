<template>
  <div class="update-accounts">
    <FButton class="connect-button" width="100%" size="big" fontSize="big" text="disconnect" @click="updateAuths" />
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, set, ref } from 'vue';
import { useRoute } from 'vue-router/composables';
import type { AuthUrls } from '@extension-base/background/types/types';
import { updateAuthorization } from '@/extension/messaging';
// import SelectAuthAccount from '@/screens/extension-ui/authorize/SelectAuthAccount.vue';
import { WalletInfo, useStore } from '@/store';

const route = useRoute();
const store = useStore();
const list = ref<AuthUrls>({});
const selectAll = ref(false);
const state = ref<Record<string, WalletInfo>>({});
const emit = defineEmits(['onUpdate']);
const url = computed(() => route.params.index);

const prepAccounts = computed<string[]>(() => {
  return Object.values(state)
    .filter(({ active }) => active)
    .map(({ address }) => address);
});

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

function isAllSelected() {
  return Object.values(state.value).every((value) => value.active === true);
}

// function onSelect(value: boolean, name: string) {
//   state.value[name].active = value;
//   selectAll.value = isAllSelected();
// }

// function onSelectAll(value: boolean) {
//   Object.keys(state).forEach((key) => {
//     set(state.value, key, {
//       ...state.value[key],
//       active: value,
//     });
//   });

//   selectAll.value = value;
// }

async function updateAuths() {
  await updateAuthorization(prepAccounts.value, url.value);
  list.value = await store.dispatch('GET_AUTHLIST');

  emit('onUpdate');
}
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
