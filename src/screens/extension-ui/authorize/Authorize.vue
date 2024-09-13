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
              :showSelectAll="showSelectAll"
              :accounts="state"
              :authType="accountAuthType"
              @onSelectAll="onSelectAll"
              @onSelect="onSelect"
            />
          </div>
        </div>

        <div class="authorize__control">
          <FButton
            width="100%"
            text="metadata.appAccess"
            size="big"
            fontSize="big"
            :disabled="isDisabledApproveBtn"
            @click="onApprove"
          />
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
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as ExtensionGettersTypes } from '@/store/extension/getters';

const state = ref<Record<string, WalletInfo>>({});
const selectAll = ref(true);

const store = useStore();
const router = useRouter();
const { t } = useI18n();

const requests = computed<AuthorizeRequest[]>(() => store.getters[ExtensionGettersTypes.authRequests]);
const request = computed<AuthorizeRequest>(() => requests.value[0]);
const accountAuthType = computed(() => request.value.request.accountAuthType);

const accounts = computed<AccountJson[]>(() => {
  const accounts: AccountJson[] = store.getters[AccountsGettersTypes.getAccounts];

  return accounts.filter(({ ethereumAddress }) => {
    if (accountAuthType.value === 'evm' && !ethereumAddress) return false;

    return true;
  });
});

const showSelectAll = computed(() => accountAuthType.value !== 'evm');
const isDisabledApproveBtn = computed(() => !Object.values(state.value).some(({ active }) => active));
const isAccountsExists = computed(() => accounts.value.length > 0);

onMounted(() => {
  const active = showSelectAll.value;

  accounts.value.forEach(({ name, address, ethereumAddress, isMobile }) => {
    set(state.value, name, {
      name: name,
      address: address,
      ethereumAddress: ethereumAddress,
      isMobile: isMobile,
      active,
    });
  });
});

watch(requests, (value: AuthorizeRequest[]) => {
  if (value.length === 0) router.push({ name: Components.Wallet });
});

const onSelect = (value: boolean, name: string) => {
  if (showSelectAll.value) selectAll.value = Object.values(state.value).every(({ active }) => active);
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
  const accounts = Object.values(state.value)
    .filter(({ active }) => active)
    .map(({ address }) => address);

  store.dispatch('APPROVE_AUTH_REQUEST', { id: request.value.id, accounts });

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
    overflow: hidden;
    text-overflow: ellipsis;
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
