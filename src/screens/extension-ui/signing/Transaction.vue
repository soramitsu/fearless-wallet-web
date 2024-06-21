<template>
  <AboveForm :fullScreen="true" header="assets.transaction" @closeHandler="onReject">
    <div v-if="isSignMobile" class="transaction-mobile">
      <Loader v-if="isSupportedNetwork" />

      <Alert
        v-else
        headerText="walletConnect.requiredNetworkAlert.header"
        message="walletConnect.requiredNetworkAlert.message"
        sizeText="small"
      />

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
import { isSignLocked, validatePassword, approveSignPassword } from '@/extension/messaging';

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

const payload = computed<SignerPayloadJSON>(() => store.getters.signRequestPayload);
const requests = computed<SigningRequest[]>(() => store.getters.signList);
const accounts = computed<AccountJson[]>(() => store.getters.getAccounts);
const selectedWallet = computed<SelectedWallet>(() => store.getters.selectedWallet);

const onSignApprove = (data: ApprovePayload) => {
  store.dispatch('APPROVE_SIGN_PASSWORD', data);
};

const classesInput = ['row', 'password-input', { 'password-input-margin': !IS_EXTENSION }];
const transactionAddress = computed(() => payload.value?.address ?? selectedWallet.value.address);
const request = computed(() => requests.value[0]);
const transactionId = computed(() => request.value.id);

const isSignMobile = computed(() => {
  const encodedAddress = BaseApi.encodeAddress(transactionAddress.value);

  return accounts.value.some((account) => account.address === encodedAddress && account.isMobile);
});

const isSupportedNetwork = computed(() => {
  if (isSignMobile.value) {
    const encodedAddress = BaseApi.encodeAddress(transactionAddress.value);

    const account = accounts.value.find((account) => account.address === encodedAddress && account.isMobile);

    return account?.chains?.some((el) => payload.value.genesisHash.includes(el));
  }

  return false;
});

const typedPayload = computed(() => {
  registry.setSignedExtensions(payload.value.signedExtensions);

  return registry.createType('ExtrinsicPayload', payload.value, { version: payload.value.version });
});
const address = computed(() => request.value.request.payload.address);

const accountName = computed(() => request.value.account.name);
const specVersion = computed(() => typedPayload.value.specVersion.toNumber());
const genesisHash = computed(() => typedPayload.value.genesisHash.toString());
const nonce = computed(() => typedPayload.value.nonce.toString());
const method = computed(() => typedPayload.value.method.toString());

const mortalityAsString = (era: ExtrinsicEra, hexBlockNumber: string): string => {
  if (era.isImmortalEra) return 'immortal';

  const { birth, death } = BaseApi.mortalityDecode(era, hexBlockNumber);

  return `mortal, valid from ${birth} to ${death}`;
};

const mortality = computed(() => mortalityAsString(typedPayload.value.era, payload.value.blockNumber));

const txInfo = computed(() => ({
  url: request.value.url,
  nonce: nonce.value,
  genesisHash: genesisHash.value,
  specVersion: specVersion.value,
  method: method.value,
  mortality: mortality.value,
}));

const min15Label = computed((): string => t(state.isLocked ? 'assets.15min' : 'assets.15minExtend').toString());
const passInputComponent = ref<typeof ValidatedInput>();

const onSignMobile = () => approveSignPassword(transactionId.value, false);

onMounted(async () => {
  if (isSignMobile.value && isSupportedNetwork) onSignMobile();

  if (!IS_EXTENSION || isSignMobile.value) return;

  passInputComponent.value?.input.focus();

  const { isLocked } = await isSignLocked(transactionAddress.value);

  state.isLocked = isLocked;
  state.isSavePass = !state.isLocked;

  if (!isLocked) state.password = '000000';
});

watch(
  () => state.password,
  () => {
    state.isErrorPassword = false;
  }
);

const onSavePassChange = (value: boolean) => (state.isSavePass = value);
const onReject = async () => store.dispatch('SIGN_CANCEL', request.value.id);

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
