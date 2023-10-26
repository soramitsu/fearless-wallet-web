<template>
  <ContentForm :bottomRightCorner="true">
    <div class="tx-details">
      <span class="list-item__key">Details</span>
      <dl class="tx-details__list">
        <template v-if="txWallet">
          <InfoRow
            :text="txWallet.name"
            :value="cutAddress(txWallet.ethereumAddress)"
            icon="wallet-logo-transaction"
            class="tx-details__row"
            :isIconPrepend="true"
          />
        </template>

        <InfoRow v-for="(value, key) in requestData" class="tx-details__row" :text="key" :value="value" :key="key" />
      </dl>
    </div>
  </ContentForm>
</template>
<script lang="ts" setup>
import { computed } from 'vue';
import {
  EIP155_SIGNING_METHODS,
  type WalletConnectTransactionRequest,
} from '@extension-base/services/wallet-connect-service/types';
import { formatEther, formatUnits } from 'ethers';
import { useI18n } from 'vue-i18n-composable';
import type { AccountJson } from '@extension-base/background/types';
import { useStore } from '@/store';
import { cut } from '@/helpers';

const store = useStore();
const { t } = useI18n();
const props = defineProps<{ request: WalletConnectTransactionRequest }>();
const params = props.request.params.request.params[0] as Record<string, string>;
const address = (params.from as string) ?? props.request.params.request.params[1];

const requestType = computed(() => props.request.params.request.method as EIP155_SIGNING_METHODS);
const isSignatureRequest = computed(() => requestType.value === EIP155_SIGNING_METHODS.PERSONAL_SIGN);
const isEvmTxRequest = computed(() => requestType.value === EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION);
const cutAddress = (address: string) => cut(address, 5);

const requestData = computed(() => {
  const data: Record<string, string> = {};
  const baseKey = 'walletConnect.requestFields';

  if (isSignatureRequest.value) {
    data[`${baseKey}.method`] = t('walletConnect.personalSign').toString();
    data[`${baseKey}.message`] = cut(params as unknown as string, 10);

    return data;
  }

  if (isEvmTxRequest.value) {
    const [, chainId] = props.request.params.chainId.split(':');
    const network: string = store.getters.getNetwork(chainId)?.name ?? `${baseKey}.networkError`;
    const { value, gas } = params;

    data[`${baseKey}.network`] = network;
    data[`${baseKey}.amount`] = formatEther(BigInt(value).toString()).toString();
    data[`${baseKey}.gasFee`] = gas ? formatUnits(BigInt(gas).toString(), 'gwei').toString() : '';
  }

  return data;
});

const txWallet = computed(() => {
  const accounts: AccountJson[] = store.getters.getAccounts;

  return accounts.find(({ ethereumAddress }) => ethereumAddress.toLowerCase() === address.toLowerCase());
});
</script>

<style lang="scss" scoped>
.tx-details {
  width: 100%;
  padding: 16px 16px 0 16px;
  display: flex;
  align-items: stretch;
  flex-flow: column;
}
.wallet__logo {
  width: 24px;
  height: 24px;
}
.tx-details__list {
  display: flex;
  flex-flow: column nowrap;
}
.list-item--with-icon {
  display: flex;
  flex-flow: row nowrap;
}
.list-item--wallet-name {
  font-size: 16px;
  font-weight: 400;
}
.list-item__address {
  font-size: 14px;
  font-style: normal;
  font-weight: 400;
}

.list-item__key {
  place-self: flex-start;
}
.list-item__data {
  place-self: flex-end;
}

.tx-details__row {
  border: 1px solid transparent;
  border-bottom-color: $default-background-color;
  display: flex;
  margin: 0;
}
.tx-details__list:last-child {
  border-bottom-color: transparent;
}
</style>
