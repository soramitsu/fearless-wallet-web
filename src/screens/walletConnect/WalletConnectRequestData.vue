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
import { evmSigningAddress } from '@extension-base/services/request-service/handlers/evmSigningContext';
import { useAccountsStore } from '@/stores/accounts';
import { cut, isSameString } from '@/helpers';
import { useNetworksStore } from '@/stores/networks';
import { reviewJson } from '@/screens/extension-ui/signing/review';

const accountsStore = useAccountsStore();
const networksStore = useNetworksStore();

const props = defineProps<{ request: WalletConnectTransactionRequest }>();
const method = computed(() => props.request.params.request.method);
const params = computed(() => props.request.params.request.params);
const isEvmTxRequest = computed(
  () =>
    method.value === EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION ||
    method.value === EIP155_SIGNING_METHODS.ETH_SEND_RAW_TRANSACTION
);
const isSignatureRequest = computed(() => !isEvmTxRequest.value);
const cutAddress = (address: string) => cut(address, 5);

const address = computed(() => {
  try {
    return evmSigningAddress(method.value, params.value);
  } catch {
    return '';
  }
});

const requestData = computed(() => {
  const data: Record<string, string> = {};
  const baseKey = 'walletConnect.requestFields';

  if (isSignatureRequest.value) {
    const message = method.value === EIP155_SIGNING_METHODS.PERSONAL_SIGN ? params.value[0] : params.value[1];
    data[`${baseKey}.method`] = method.value;
    data[`${baseKey}.message`] = cut(typeof message === 'string' ? message : reviewJson(message), 10);

    return data;
  }

  if (isEvmTxRequest.value) {
    const [, chainId] = props.request.params.chainId.split(':');
    const network: string = networksStore.getNetwork(chainId)?.name ?? `${baseKey}.networkError`;
    const { value, gas } = Array.isArray(params.value) ? params.value[0] : params.value;

    data[`${baseKey}.network`] = network;
    data[`${baseKey}.amount`] = value ? formatEther(BigInt(value).toString()).toString() : '';
    data[`${baseKey}.gasFee`] = gas ? formatUnits(BigInt(gas).toString(), 'gwei').toString() : '';
  }

  return data;
});

const txWallet = computed(() => {
  const accounts = accountsStore.accounts;

  return accounts.find(({ ethereumAddress }) => isSameString(ethereumAddress, address.value));
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
  font-size: 1em;
  font-weight: 400;
}
.list-item__address {
  font-size: 0.875em;
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
  border-bottom-color: palette($default-background-color, var(--fw-divider));
  display: flex;
  margin: 0;
}
.tx-details__list:last-child {
  border-bottom-color: transparent;
}
</style>
