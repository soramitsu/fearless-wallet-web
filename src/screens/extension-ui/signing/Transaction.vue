<template>
  <AboveForm :fullScreen="true" header="assets.transaction" @closeHandler="onReject">
    <div v-if="isSignMobile" class="transaction-mobile">
      <Loader />

      <FButton
        text="common.cancel"
        width="100%"
        size="medium"
        fontSize="big"
        type="secondary"
        :border="false"
        @click="onReject"
      />
    </div>

    <div v-else class="transaction-content">
      <div>
        <WalletInfo class="wallet-info" :name="accountName" :address="address" />

        <InfoList>
          <InfoItem v-for="(value, key) in txInfo" :name="key" :value="value" :key="key" />
        </InfoList>
      </div>

      <div class="control-form">
        <FButton
          size="big"
          type="secondary"
          class="button"
          :disabled="state.isDisabled"
          :border="false"
          text="common.cancel"
          @click="onReject"
        />

        <FButton size="big" :disabled="state.isDisabled" class="button" text="common.accept" @click="sendExtrinsic" />
      </div>
    </div>
  </AboveForm>
</template>

<script lang="ts" setup>
import registry from '@extension-base/api/substrate/typeRegistry';
import { reactive, computed } from 'vue';
import { type GenericExtrinsicPayload } from '@polkadot/types/extrinsic/ExtrinsicPayload';
import { formatUnits } from 'ethers';
import { type EvmRequestPayload } from '@extension-base/services/request-service/types';
import type { SignerPayloadJSON } from '@polkadot/types/types';
import type { AccountJson, SigningRequest } from '@extension-base/background/types/types';
import type { ExtrinsicEra } from '@polkadot/types/interfaces';
import type { ApprovePayload } from '@/store/extension/actions';
import BaseApi from '@/util/BaseApi';
import WalletInfo from '@/screens/extension-ui/signing/WalletInfo.vue';
import InfoList from '@/screens/extension-ui/InfoList.vue';
import InfoItem from '@/screens/extension-ui/InfoItem.vue';
import { useStore, type SelectedWallet } from '@/store';
import { type SignRequestList } from '@/store/extension/types';
import { cut } from '@/helpers';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as ExtensionGetterTypes } from '@/store/extension/getters';

const state = reactive({
  isDisabled: false,
});

const store = useStore();

const payload = computed<SignerPayloadJSON>(() => store.getters[ExtensionGetterTypes.signRequestPayload]);
const requests = computed<SignRequestList>(() => store.getters[ExtensionGetterTypes.signList]);
const accounts = computed<AccountJson[]>(() => store.getters[AccountsGettersTypes.getAccounts]);
const selectedWallet = computed<SelectedWallet>(() => store.getters[AccountsGettersTypes.selectedWallet]);

const onSignApprove = (data: ApprovePayload) => {
  store.dispatch('APPROVE_SIGN', data);
};

const transactionAddress = computed(() => payload.value?.address ?? selectedWallet.value.address);
const request = computed<SigningRequest | EvmRequestPayload>(
  () => requests.value.substrate[0] ?? Object.values(requests.value.evm)[0]
);

const isSignMobile = computed(() => {
  const encodedAddress = BaseApi.encodeAddress(transactionAddress.value);

  return accounts.value.some((account) => account.address === encodedAddress && account.isMobile);
});

const address = computed(() => {
  if (request.value && 'data' in request.value) return request.value.data[0].from ?? request.value.data[1];

  return request.value?.account.address;
});

const typedPayload = computed<GenericExtrinsicPayload | undefined>(() => {
  if (request.value && 'data' in request.value) return;

  registry.setSignedExtensions(payload.value.signedExtensions);

  return registry.createType('ExtrinsicPayload', payload.value, { version: payload.value.version });
});

const accountName = computed(() => {
  if (!request.value) return '';

  if ('account' in request.value) return request.value.account.name;

  return request.value.data[0].from ?? request.value.data[0];
});

const mortalityAsString = (era: ExtrinsicEra | undefined, hexBlockNumber: string): string | undefined => {
  if (!era) return;

  if (era.isImmortalEra) return 'immortal';

  const { birth, death } = BaseApi.mortalityDecode(era, hexBlockNumber);

  return `mortal, valid from ${birth} to ${death}`;
};

const mortality = computed(() => mortalityAsString(typedPayload.value?.era, payload.value.blockNumber));

const txInfo = computed(() => {
  const info: Record<string, string | number> = {
    url: request.value.url,
  };

  if (request.value && 'data' in request.value) {
    if (typeof request.value.data === 'object') {
      const [payload] = request.value.data;

      if (typeof payload === 'object') {
        if ('gas' in payload) info.gas = formatUnits(payload.gas, 'gwei');
        if ('value' in payload) info.value = formatUnits(payload.value);
        if ('to' in payload) info.to = cut(payload.to.toString(), 15);
        if ('from' in payload) info.from = cut(payload.from.toString(), 15);
        if ('data' in payload) info.data = cut(payload.data.toString(), 15);
      } else {
        info.data = request.value.data[0];
      }
    } else {
      info.data = request.value.data[0];
    }
  } else {
    const data: Record<string, string | number | undefined> = {
      nonce: typedPayload.value?.nonce.toString(),
      wallet: request.value.account.name,
      address: request.value.account.address,
      genesisHash: typedPayload.value?.genesisHash.toString(),
      specVersion: typedPayload.value?.specVersion.toString(),
      method: typedPayload.value?.method.toString(),
      mortality: mortality.value,
    };

    for (const [key, value] of Object.entries(data)) {
      if (value) {
        info[key] = value;
      }
    }
  }

  return info;
});

const onReject = async () => store.dispatch('SIGN_CANCEL', request.value.id);

const sendExtrinsic = async () => {
  state.isDisabled = true;

  onSignApprove({ id: request.value.id });
};
</script>

<style lang="scss" scoped>
.transaction-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  .wallet-info {
    margin-bottom: 14px;
  }
}

.transaction-mobile {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-flow: column;
}

.row {
  margin-top: 15px;
}

.control-form {
  display: flex;
  flex-flow: row;
  width: 100%;
  gap: 6px;

  .button {
    width: 100%;
  }
}
</style>
