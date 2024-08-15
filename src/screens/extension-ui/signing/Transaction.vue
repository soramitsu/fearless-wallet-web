<template>
  <AboveForm :fullScreen="true" header="assets.transaction" @closeHandler="onReject">
    <div v-if="isSignMobile" class="transaction-mobile">
      <Loader />

      <!-- <Alert
        headerText="walletConnect.requiredNetworkAlert.header"
        message="walletConnect.requiredNetworkAlert.message"
        sizeText="small"
      /> -->

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
        <ValidatedInput
          v-if="state.isLocked"
          ref="passInputComponent"
          :value="state.password"
          placeholder="common.password"
          size="big"
          :class="classesInput"
          errorDescriptions="common.invalidPassword"
          :readonly="!state.isLocked"
          :isError="state.isErrorPassword"
          :showPassword="true"
          @keypress.native="keypress"
          @change="changePassword"
        />

        <Checkbox :value="state.isSavePass" size="medium" :label="min15Label" @change="onSavePassChange" />

        <div class="control-form-submit">
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
    </div>
  </AboveForm>
</template>

<script lang="ts" setup>
import registry from '@extension-base/api/substrate/typeRegistry';
import { reactive, ref, watch, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n-composable';
import { type GenericExtrinsicPayload } from '@polkadot/types/extrinsic/ExtrinsicPayload';
import { formatUnits } from 'ethers';
import { type EvmRequestPayload } from '@extension-base/services/request-service/types';
import type { SignerPayloadJSON } from '@polkadot/types/types';
import type { AccountJson, SigningRequest } from '@extension-base/background/types/types';
import type { ExtrinsicEra } from '@polkadot/types/interfaces';
import type { ApprovePayload } from '@/store/extension/actions';
import ValidatedInput from '@/components/ValidatedInput.vue';
import BaseApi from '@/util/BaseApi';
import Checkbox from '@/components/Checkbox.vue';
import WalletInfo from '@/screens/extension-ui/signing/WalletInfo.vue';
import InfoList from '@/screens/extension-ui/InfoList.vue';
import InfoItem from '@/screens/extension-ui/InfoItem.vue';
import { useStore, type SelectedWallet } from '@/store';
import { IS_EXTENSION } from '@/consts/global';
import { type SignRequestList } from '@/store/extension/types';
import { cut } from '@/helpers';
import { isSignLocked, validatePassword, approveSignPassword } from '@/extension/messaging';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as ExtensionGetterTypes } from '@/store/extension/getters';

const state = reactive({
  isLocked: true,
  isSignPopupVisible: false,
  isErrorPassword: false,
  isSavePass: false,
  isDisabled: false,
  password: '',
});

const store = useStore();
const { t } = useI18n();

const payload = computed<SignerPayloadJSON>(() => store.getters[ExtensionGetterTypes.signRequestPayload]);
const requests = computed<SignRequestList>(() => store.getters[ExtensionGetterTypes.signList]);
const accounts = computed<AccountJson[]>(() => store.getters[AccountsGettersTypes.getAccounts]);
const selectedWallet = computed<SelectedWallet>(() => store.getters[AccountsGettersTypes.selectedWallet]);

const onSignApprove = (data: ApprovePayload) => {
  store.dispatch('APPROVE_SIGN_PASSWORD', data);
};

const classesInput = ['row', 'password-input', { 'password-input-margin': !IS_EXTENSION }];
const transactionAddress = computed(() => payload.value?.address ?? selectedWallet.value.address);
const request = computed<SigningRequest | EvmRequestPayload>(
  () => requests.value.substrate[0] ?? Object.values(requests.value.evm)[0]
);
const transactionId = computed(() => request.value.id);

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

const min15Label = computed((): string => t(state.isLocked ? 'assets.15min' : 'assets.15minExtend').toString());
const passInputComponent = ref<typeof ValidatedInput>();

const onSignMobile = () => approveSignPassword(transactionId.value, false);

onMounted(async () => {
  if (isSignMobile.value) onSignMobile();

  if (!IS_EXTENSION || isSignMobile.value) return;

  passInputComponent.value?.input.focus();

  const { isLocked } = await isSignLocked(transactionAddress.value);

  state.isLocked = isLocked;
  state.isSavePass = !state.isLocked;

  if (!isLocked) state.password = '000000';
});

watch(
  () => state.password,
  () => (state.isErrorPassword = false)
);

const onSavePassChange = (value: boolean) => (state.isSavePass = value);
const onReject = () => store.dispatch('SIGN_CANCEL', transactionId.value);

const changePassword = (value: string) => (state.password = value);

const sendExtrinsic = async () => {
  state.isDisabled = true;

  if (state.isLocked) {
    const isValidPass = await validatePassword(address.value, state.password);

    if (!isValidPass) {
      state.isErrorPassword = true;
      state.isDisabled = false;

      return;
    }
  }

  onSignApprove({
    id: transactionId.value,
    isSavePass: state.isSavePass,
    password: state.password,
  });
};

const keypress = ({ key }: KeyboardEvent) => {
  if (key === 'Enter') sendExtrinsic();
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

.password-input {
  width: 100%;
}

.password-input-margin {
  margin-bottom: 15px;
}
.control-form {
  display: flex;
  flex-flow: column;
  align-items: flex-start;

  &-submit {
    display: flex;
    flex-flow: row;
    width: 100%;
    gap: 6px;

    .button {
      width: 100%;
    }
  }
}
</style>
