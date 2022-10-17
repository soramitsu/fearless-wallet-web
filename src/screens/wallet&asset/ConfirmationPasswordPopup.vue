<template>
  <Popup class="sending-popup" :headerType="headerType" sizeWidth="big" :headerText="popupHeader" :handlerClose="close">
    <div class="popup-content">
      <template v-if="!transactionState && !isSignMobile">
        <img src="@/assets/lock-green.svg" />

        <div class="text row">Enter password to confirm the transaction</div>

        <ValidatedInput
          v-if="!isUnlock"
          v-model="password"
          placeholder="Password"
          size="big"
          class="input row"
          errorDescriptions="Incorrect password"
          :isError="isErrorPassword"
          :showPassword="true"
        />

        <div class="remember__checkbox">
          <Checkbox v-model="isSavePass" size="medium" :label="prepLabel" />
        </div>

        <Button
          text="Continue"
          width="100%"
          size="medium"
          fontSize="big"
          type="primary"
          :disabled="disabledButton"
          :border="false"
          @click="send"
        />
      </template>

      <SignMobile v-if="isSignMobile && !isSendTransaction" @onSign="signMobile" @onCancel="close" />

      <template v-if="isSendTransaction">
        <div class="descriptions">
          <NetworkLogo :name="firstNetwork" :width="30" />

          <template v-if="secondNetwork">
            <s-icon name="arrows-arrow-right-24" />

            <NetworkLogo :name="secondNetwork" :width="30" />
          </template>
        </div>
        <div class="transfer-amount">{{ transferAmountString }}</div>
        <div class="transfer-value">{{ transferValueString }}</div>
      </template>
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import { Getter, Action } from 'vuex-class';

import type {
  Currencies,
  Currency,
  RequestSentInfo,
  TAction,
  SignerPayloadJSON,
  BeaconPayloadJSON,
} from '@/interfaces';
import { beaconController } from '@/controllers/beaconController';
import { isSignLocked } from '@/extension/messaging';
import { isExtension } from '@/helpers/common';
import Loader from '@/components/Loader.vue';
import Popup from '@/components/Popup.vue';
import Button from '@/components/Button.vue';
import Checkbox from '@/components/Checkbox.vue';
import ValidatedInput from '@/components/ValidatedInput.vue';
import NetworkLogo from '@/components/NetworkLogo.vue';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { ActionTypes as SignActionsTypes, ApprovePayload } from '@/store/sign/actions';
import SignMobile from '@/screens/wallet&asset/SignMobile.vue';

@Component({
  components: {
    Popup,
    Button,
    Loader,
    Checkbox,
    NetworkLogo,
    ValidatedInput,
    SignMobile,
  },
})
export default class ConfirmationPasswordPopup extends Vue {
  password = '';
  loading = false;
  isErrorPassword = false;
  isUnlock = false;
  isSavePass = false;
  signedPayload: RequestSentInfo | null = null;
  transactionState: 'pending' | 'success' | 'failed' | null = null;

  @Prop(String) amount!: string;
  @Prop(String) value!: string;
  @Prop(String) firstNetwork!: string;
  @Prop(String) secondNetwork!: string;
  @Prop(String) address!: string;
  @Prop(String) transactionId?: string;
  @Prop(Object) currency!: Currency;
  @Prop(Object) payload?: SignerPayloadJSON;

  @Getter(NetworksGettersTypes.getCurrencies) currencies!: Currencies;
  @Action(SignActionsTypes.APPROVE_SIGN_PASSWORD) onSignApprove!: TAction<ApprovePayload>;
  @Action(SignActionsTypes.SIGN_CANCEL) onSignCancel!: TAction<string>;

  get disabledButton() {
    return this.password === '' || this.isErrorPassword;
  }

  get isSignMobile() {
    return BaseApi.getAddressType(this.address) === 'address';
  }

  get prepLabel() {
    return !this.isUnlock
      ? 'Do not ask for a password for 15 min.'
      : 'Extend the period without password by 15 minutes';
  }

  get headerType() {
    if (this.transactionState === 'success') return 'success';
    if (this.transactionState === 'failed') return 'failed';

    return 'pending';
  }

  async signMobile() {
    const payload: BeaconPayloadJSON = this.payload as any;
    delete (payload as any).address;
    if (payload) payload.type = 'json';
    if (!this.transactionId) this.$emit('transferMobile');
    else if (payload) await beaconController.sendRequest(payload as unknown as BeaconPayloadJSON);
    // approveSignSignature(this.transactionId, res.signature);
  }

  get popupHeader() {
    if (this.transactionState === 'success') return 'Transaction Done';
    if (this.transactionState === 'failed') return 'Transaction Error';
    if ((this.loading && this.isUnlock) || (this.isSignMobile && this.transactionState !== 'pending')) return '';

    return 'Transaction is pending';
  }

  get transferAmountString() {
    return `-${this.amount} ${this.currency.displayName.toUpperCase()}`;
  }

  get transferValueString() {
    return `$${this.value}`;
  }

  @Watch('password')
  resetStatusError() {
    this.isErrorPassword = false;
  }

  get isSendTransaction() {
    return !!this.transactionState;
  }

  close() {
    if (this.loading) return;

    this.$emit('close', this.isSendTransaction);
  }

  async mounted() {
    if (!isExtension() && !this.isSignMobile) return;

    if (this.transactionId === undefined) return;

    const { isLocked } = await isSignLocked(this.transactionId);

    this.isUnlock = !isLocked;
    this.isSavePass = this.isUnlock;
  }

  async send() {
    if (!this.isUnlock) {
      this.isErrorPassword = !BaseApi.unlockPair(this.address, this.password);

      if (this.isErrorPassword) return;
    }

    this.loading = true;
    this.transactionState = 'pending';

    if (this.transactionId) {
      await this.onSignApprove({
        id: this.transactionId,
        isSavePass: this.isSavePass,
        password: this.password,
      });
    } else {
      const isSuccessfulTransaction = await this.currency?.send(this.address, this.amount);

      this.transactionState = isSuccessfulTransaction ? 'success' : 'failed';
    }

    this.transactionState = 'success';
    this.loading = false;
  }
}
</script>

<style lang="scss" scoped>
.sending-popup {
  z-index: 399;

  .popup-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 0 25px;
    min-height: 175px;

    .input {
      width: 100%;
    }

    .text {
      font-weight: 700;
      font-size: 18px;
      width: 250px;
    }

    .row {
      margin-top: 15px;
    }

    .descriptions {
      display: flex;
      justify-content: space-between;
      background: $secondary-background-color;
      border-radius: 50px;
      margin-bottom: 20px;
      padding: 12px;

      .s-icon-arrows-arrow-right-24 {
        color: rgba(255, 255, 255, 0.3);
        font-size: 30px !important;
        margin: 0 10px;
      }
    }

    .transfer-amount {
      font-weight: 800;
      font-size: 20px;
      margin-bottom: 10px;
    }

    .transfer-value {
      font-size: 16px;
      color: $gray-color;
    }

    .remember__checkbox {
      width: 100%;
      display: flex;
      align-items: flex-start;
    }
  }
}
</style>
