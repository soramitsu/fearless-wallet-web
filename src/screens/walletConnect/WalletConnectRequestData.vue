<template>
  <ContentForm :bottomRightCorner="true">
    <div class="tx-details">
      <span class="list-item__key">{{ $t('walletConnect.details') }}</span>
      <dl class="tx-details__list">
        <template v-if="txWallet">
          <InfoRow
            :text="txWallet.name"
            :value="cutAddress(txWallet.ethereumAddress)"
            icon="wallet-logo-transaction"
            iconAppend="check"
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
import { isEthereumAddress } from '@polkadot/util-crypto';
import type { AccountJson } from '@extension-base/background/types/types';
import { useStore } from '@/store';
import { cut } from '@/helpers';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';

const store = useStore();
const props = defineProps<{ request: WalletConnectTransactionRequest }>();
const method = props.request.params.request.method;
const params = props.request.params.request.params;
const isEvmTxRequest = computed(
  () =>
    method === EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION || method === EIP155_SIGNING_METHODS.ETH_SEND_RAW_TRANSACTION
);
const isSignatureRequest = computed(() => !isEvmTxRequest.value);
const cutAddress = (address: string) => cut(address, 5);

const address = computed(() => {
  if (method === EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION) {
    return (params[0].from as string).toLowerCase();
  }

  if (Array.isArray(params)) {
    return isEthereumAddress(params[0]) ? params[0] : params[1];
  }

  return params[0].from as string;
});

const requestData = computed(() => {
  const data: Record<string, string> = {};
  const baseKey = 'walletConnect.requestFields';

  if (isSignatureRequest.value) {
    const message = isEthereumAddress(params[0]) ? params[1] : params[0];
    data[`${baseKey}.method`] = method;
    data[`${baseKey}.message`] = cut(message as unknown as string, 10);

    return data;
  }

  if (isEvmTxRequest.value) {
    const [, chainId] = props.request.params.chainId.split(':');
    const network: string = store.getters[NetworksGettersTypes.getNetwork](chainId)?.name ?? `${baseKey}.networkError`;
    const { value, gas } = Array.isArray(params) ? params[0] : params;

    data[`${baseKey}.network`] = network;
    data[`${baseKey}.amount`] = value ? formatEther(BigInt(value).toString()).toString() : '';
    data[`${baseKey}.gasFee`] = gas ? formatUnits(BigInt(gas).toString(), 'gwei').toString() : '';
  }

  return data;
});

const txWallet = computed(() => {
  const accounts: AccountJson[] = store.getters.getAccounts;

  return accounts.find(({ ethereumAddress }) => ethereumAddress.toLowerCase() === address.value.toLowerCase());
});
</script>

<style lang="scss" scoped>
.tx-details {
  width: 100%;
  color: $default-white;
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
