<template>
  <Popup class="sending-popup" headerType="completed" sizeWidth="big" :headerText="popupHeader" :handlerClose="close">
    <div class="popup-content">
      <template v-if="!loading">
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

      <Loader v-else-if="loading" />

      <template v-else>
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
import { Getter } from 'vuex-class';
import { encodeAddress } from '@polkadot/util-crypto';
import type { Currencies, Currency } from '@/interfaces/currencies';
import { isSignLocked } from '@/extension/messaging';
import { isExtension } from '@/helpers/common';
import Loader from '@/components/Loader.vue';
import Popup from '@/components/Popup.vue';
import Button from '@/components/Button.vue';
import ValidatedInput from '@/components/ValidatedInput.vue';
import NetworkLogo from '@/components/NetworkLogo.vue';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import Checkbox from '@/components/Checkbox.vue';

@Component({
  components: {
    Popup,
    Button,
    Loader,
    Checkbox,
    NetworkLogo,
    ValidatedInput,
  },
})
export default class ConfirmationPasswordPopup extends Vue {
  password = '';
  loading = false;
  isErrorPassword = false;
  isUnlock = false;
  isSavePass = false;

  @Prop(String) amount!: string;
  @Prop(String) value!: string;
  @Prop(String) firstNetwork!: string;
  @Prop(String) secondNetwork!: string;
  @Prop(String) address!: string;
  @Prop(String) transactionId!: string;
  @Prop(Object) currency!: Currency;
  @Getter(NetworksGettersTypes.getCurrencies) currencies!: Currencies;

  get disabledButton() {
    return this.password === '' || this.isErrorPassword;
  }

  get prepLabel() {
    return !this.isUnlock
      ? 'Do not ask for a password for 15 min.'
      : 'Extend the period without password by 15 minutes';
  }

  get popupHeader() {
    return !this.isUnlock || this.loading ? '' : 'Transaction done';
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

  close() {
    if (this.loading) return;

    this.$emit('close', this.isUnlock);
  }

  async mounted() {
    if (isExtension()) {
      const { isLocked } = await isSignLocked(this.transactionId);

      this.isUnlock = !isLocked;
      this.isSavePass = this.isUnlock;
    }
  }

  async send() {
    if (!this.isUnlock) {
      this.isErrorPassword = !BaseApi.unlockPair(this.address, this.password);

      if (this.isErrorPassword) return;
    }

    this.loading = true;

    if (isExtension()) {
      await this.$store.dispatch('APPROVE_SIGN_PASSWORD', {
        id: this.transactionId,
        isSavePass: this.isSavePass,
        password: this.password,
      });
    } else await this.currency?.send(this.address, this.amount);

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
      background: rgba(255, 255, 255, 0.05);
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
      color: rgba(255, 255, 255, 0.5);
    }

    .remember__checkbox {
      width: 100%;
      display: flex;
      align-items: flex-start;
    }
  }
}
</style>
