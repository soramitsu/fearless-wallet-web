<template>
  <Popup :header="popupHeader" :handlerClose="close" sizeWidth="big" class="sending-popup">
    <div class="popup-content">
      <template v-if="!isUnlock">
        <img src="@/assets/lock-green.svg" />

        <div class="text row">Enter password to confirm the transaction</div>

        <ValidatedInput
          v-model="password"
          placeholder="Password"
          size="big"
          class="input row"
          errorDescriptions="Incorrect password"
          :isError="isErrorPassword"
          :showPassword="true"
        />

        <Button
          text="Continue"
          width="100%"
          size="medium"
          fontSize="big"
          type="primary"
          class="row"
          :border="false"
          @click="send"
        />
      </template>

      <Loader v-else-if="loading" />

      <template v-else>
        <div class="descriptions">
          <img :src="getImg(firstNetwork)" class="network-img" />

          <template v-if="secondNetwork">
            <s-icon name="arrows-arrow-right-24" />

            <img :src="getImg(secondNetwork)" class="network-img" />
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
import type { Currencies, Currency } from '@/interfaces/currencies';
import Loader from '@/components/Loader.vue';
import Popup from '@/components/Popup.vue';
import Button from '@/components/Button.vue';
import ValidatedInput from '@/components/ValidatedInput.vue';
import BaseApi from '@/util/BaseApi';
import { getImgPathByNetworkName } from '@/util/imgPath';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';

@Component({
  components: {
    Popup,
    Button,
    Loader,
    ValidatedInput,
  },
})
export default class ConfirmationPasswordPopup extends Vue {
  password = '';
  loading = false;
  isErrorPassword = false;
  isUnlock = false;

  @Prop(String) amount!: string;
  @Prop(String) value!: string;
  @Prop(String) token!: string;
  @Prop(String) header!: string;
  @Prop(String) firstNetwork!: string;
  @Prop(String) secondNetwork!: string;
  @Prop(String) address!: string;
  @Prop(Object) currency!: Currency;
  @Prop(Function) handlerClose!: VoidFunction;

  @Getter(NetworksGettersTypes.getCurrencies) currencies!: Currencies;

  get popupHeader() {
    return this.loading ? 'Transaction done' : this.header;
  }

  get transferAmountString() {
    return `-${this.amount} ${this.token.toUpperCase()}`;
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

  getImg(network: string) {
    return require(`@/assets/networks/${getImgPathByNetworkName(network)}`);
  }

  async send() {
    try {
      BaseApi.unlockPair(this.address, this.password);

      this.isUnlock = true;
    } catch {
      this.isErrorPassword = true;

      return;
    }

    this.loading = true;

    await this.currency?.send(this.address, this.amount);

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

      .network-img {
        width: 30px;
      }

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
  }
}
</style>
