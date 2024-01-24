<template>
  <AboveForm header="Authorize" :fullScreen="true" @closeHandler="onReject">
    <div class="authorize">
      <template v-if="isAccountsExists">
        <div>
          <Alert>
            <p class="authorize__content" v-html="message"></p>
          </Alert>

          <div class="authorize-account-list">
            <SelectAuthAccount
              :selectAll="selectAll"
              :accounts="state"
              @onSelectAll="onSelectAll"
              @onSelect="onSelect"
            />
          </div>
        </div>

        <div class="authorize__control">
          <FButton width="100%" text="metadata.appAccess" size="big" fontSize="big" @click="onApprove" />
        </div>
      </template>

      <template v-else>
        <Alert message="auth.noAccounts" />

        <FButton width="100%" text="common.understood" size="big" fontSize="big" @click="onReject" />
      </template>
    </div>
  </AboveForm>
</template>

<script lang="ts" setup>
import { type AuthorizeRequest, type AccountJson } from '@extension-base/background/types/types';
import { computed, ref, set, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router/composables';
import { useI18n } from 'vue-i18n-composable';
import { Components } from '@/router/routes';
import { type WalletInfo, useStore } from '@/store';
import SelectAuthAccount from '@/screens/extension-ui/authorize/SelectAuthAccount.vue';
import BaseApi from '@/util/BaseApi';

const state = ref<Record<string, WalletInfo>>({});
const selectAll = ref(true);

const store = useStore();
const router = useRouter();
const { t } = useI18n();
const accounts = computed<AccountJson[]>(() => store.getters.getAccounts);
const requests = computed<AuthorizeRequest[]>(() => store.getters.authRequests);
const request = computed<AuthorizeRequest>(() => requests.value[0]);

watch(requests, (value: AuthorizeRequest[]) => {
  if (value.length === 0) router.push({ name: Components.Wallet });
});

const isAccountsExists = computed(() => accounts.value.length > 0);

const prepAccounts = computed(() =>
  Object.values(state.value)
    .filter(({ active }) => active)
    .map(({ address }) => address)
);

onMounted(() => {
  accounts.value.forEach(({ name, address, isMobile }) =>
    set(state.value, name, {
      name: name,
      address: address,
      isMobile: isMobile,
      active: true,
    })
  );
});

const onSelect = (value: boolean, name: string) => {
  state.value[name].active = value;
  selectAll.value = Object.values(state.value).every(({ active }) => active);
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

const message = computed(() =>
  t('authorize.authWarningMessage', {
    name: `<span class="authorize__content--name">${request.value.request.origin}</span>`,
    link: `<span class="authorize__content--link">${request.value.url}</span>`,
  })
);

const redirect = () => {
  if (BaseApi.useIsPopup()) setTimeout(() => router.push({ name: Components.Wallet }), 100); // don`t removed setTimeout
};

const onApprove = () => {
  store.dispatch('APPROVE_AUTH_REQUEST', { id: request.value.id, accounts: prepAccounts.value });

  redirect();
};

const onReject = () => store.dispatch('REJECT_AUTH_REQUEST', request.value.id);
</script>

<style lang="scss">
.authorize {
  display: flex;
  flex-flow: column;
  justify-content: space-between;
  height: 100%;

  .authorize__content {
    font-size: 14px;
    line-height: 21px;
    font-weight: 400;
  }

  .authorize__content--name {
    color: $pink-lavender-color;
  }

  .authorize__content--link {
    color: $pink-lavender-color;
    cursor: pointer;
  }

  .authorize__control {
    display: flex;
    flex-flow: column;
    justify-content: space-between;
  }

  .authorize-account-list {
    height: 300px;
  }
}
</style>
