<template>
  <AboveForm header="Authorize" :fullScreen="true" @closeHandler="onReject">
    <div class="authorize">
      <template v-if="isAccountsExists">
        <div>
          <Alert>
            <p class="authorize__content">
              <span
                v-for="(part, index) in messageParts"
                :key="`${part.kind}-${index}`"
                :class="getMessagePartClass(part)"
              >
                {{ getMessagePartText(part) }}
              </span>
            </p>
          </Alert>

          <div class="authorize-account-list">
            <SelectAuthAccountForm
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
import { computed, ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { type AuthorizeMessagePart, splitAuthorizeMessage } from './messageParts';
import type { AuthorizeRequest, AccountJson } from '@extension-base/background/types/types';
import type { WalletInfo } from '@/stores';
import { useI18n } from '@/locales/useI18n';
import { Components } from '@/router/routes';
import SelectAuthAccountForm from '@/screens/extension-ui/authorize/SelectAuthAccountForm.vue';
import { IS_POPUP } from '@/consts/globalClient';
import { useExtensionStore } from '@/stores/extension';
import { useAccountsStore } from '@/stores/accounts';
import { WalletEcosystem } from '@/interfaces';
import { encodeIrohaI105Address } from '@/util/iroha';

const state = ref<Record<string, WalletInfo>>({});
const selectAll = ref(true);

const extensionStore = useExtensionStore();
const accountsStore = useAccountsStore();
const router = useRouter();
const { t } = useI18n();

const requests = computed(() => extensionStore.authRequests);
const request = computed(() => requests.value[0]);
const accountAuthType = computed(() => request.value?.request?.accountAuthType);
const allowedAccounts = computed(() => new Set(request.value?.request.allowedAccounts ?? []));

const accounts = computed<AccountJson[]>(() => {
  const accounts: AccountJson[] = accountsStore.accounts;

  return accounts.filter((account) => {
    const { ethereumAddress, solanaAddress, walletEcosystem } = account;

    if (accountAuthType.value === 'evm' && !ethereumAddress) return false;
    if (accountAuthType.value === 'solana') return !!solanaAddress || walletEcosystem === WalletEcosystem.Solana;
    if (accountAuthType.value === 'iroha') return !!resolveIrohaAuthAddress(account, allowedAccounts.value);

    return true;
  });
});

const showSelectAll = computed(
  () => accountAuthType.value !== 'evm' && accountAuthType.value !== 'solana' && accountAuthType.value !== 'iroha'
);
const isDisabledApproveBtn = computed(() => !Object.values(state.value).some(({ active }) => active));
const isAccountsExists = computed(() => accounts.value.length > 0);

const isAllSelected = () => Object.values(state.value).every(({ active }) => active);

onMounted(() => {
  const active = showSelectAll.value;

  accounts.value.forEach((account) => {
    const { name, address, ethereumAddress, irohaAddress, isMobile, solanaAddress, walletEcosystem } = account;
    const authAddress =
      accountAuthType.value === 'solana' && solanaAddress
        ? solanaAddress
        : accountAuthType.value === 'solana' && walletEcosystem === WalletEcosystem.Solana
        ? address
        : accountAuthType.value === 'iroha'
        ? resolveIrohaAuthAddress(account, allowedAccounts.value) ?? address
        : address;

    state.value[authAddress] = {
      name,
      address: authAddress,
      ethereumAddress,
      irohaAddress,
      solanaAddress,
      isMobile,
      active,
    };
  });

  selectAll.value = isAllSelected();
});

watch(requests, (value: AuthorizeRequest[]) => {
  if (value.length === 0) router.push({ name: Components.Wallet });
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

const requestOrigin = computed(() => request.value?.request.origin ?? '');
const requestUrl = computed(() => request.value?.url ?? '');
const messageParts = computed(() =>
  splitAuthorizeMessage(
    t('authorize.authWarningMessage', {
      name: '{name}',
      link: '{link}',
    })
  )
);

const getMessagePartClass = (part: AuthorizeMessagePart) => {
  if (part.kind === 'name') return 'authorize__content--name';
  if (part.kind === 'link') return 'authorize__content--link';

  return undefined;
};

const getMessagePartText = (part: AuthorizeMessagePart) => {
  if (part.kind === 'name') return requestOrigin.value;
  if (part.kind === 'link') return requestUrl.value;

  return part.text;
};

const redirect = () => {
  if (IS_POPUP) setTimeout(() => router.push({ name: Components.Wallet }), 100); // don`t removed setTimeout
};

const onApprove = () => {
  const accounts = Object.values(state.value)
    .filter(({ active }) => active)
    .map(({ address }) => address);

  extensionStore.approveAuthRequests({ id: request.value.id, accounts });

  redirect();
};

const onReject = () => extensionStore.rejectAuthRequests(request.value.id);

const resolveIrohaAuthAddress = (
  { address, irohaAddress, irohaPublicKeyHex, walletEcosystem }: AccountJson,
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

<style lang="scss">
.authorize {
  display: flex;
  flex-flow: column;
  justify-content: space-between;
  height: 100%;

  .authorize__content {
    font-size: 0.875em;
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
