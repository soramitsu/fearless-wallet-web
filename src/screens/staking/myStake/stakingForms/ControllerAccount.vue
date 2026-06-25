<template>
  <div class="controller-account">
    <template v-if="step === 1">
      <InfoRow
        text="staking.stashAccount"
        data-testid="stashAccount"
        borderType="default"
        :value="accountName"
        :hideLastBorder="false"
      />

      <InfoRow
        text="staking.setController"
        data-testid="controllerAccount"
        borderType="default"
        :value="controllerCut"
        :hideLastBorder="false"
      />
    </template>

    <template v-else>
      <Hint text="staking.stashBond" iconName="notification" class="hint row" />

      <InputWithIcon
        :value="addressCut"
        icon="close"
        placeholder="staking.setController"
        data-testid="controllerAccountInput"
        @click="setControllerAddress"
      />

      <Alert
        v-if="!isValidController"
        message="staking.alreadyControlling"
        sizeText="small"
        class="already-controlling"
      />

      <slot></slot>

      <Hint text="staking.controllerUnbond" iconName="notification" class="hint row" />
    </template>

    <InfoRow
      v-show="step !== 1"
      class="info-fee"
      text="assets.networkFee"
      borderType="default"
      icon="info"
      data-testid="networkFee"
      :value="`${fee} ${asset}`"
      :price="valueString"
      :hideLastBorder="false"
      :iconClasses="['network-fee']"
    />

    <Tooltip text="staking.stakingFee" target=".network-fee" placement="right" />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import { cut } from '@/helpers';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

export default defineComponent({ name: 'ControllerAccount' ,
  props: {
    step: { type: Number },
    fee: { type: String },
    stakingCurrency: { type: Object },
    stakingNetwork: { type: Object },
    isValidController: { type: Boolean },
    controllerAddress: { type: String },
  },
  data() {
    return {
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
    };
  },
  computed: {
    controllerName() {
      return this.stakingNetwork.controllerName;
    },
    controllerCut() {
      return cut(this.controllerName);
    },
    asset() {
      return this.stakingCurrency.symbol;
    },
    addressCut() {
      return cut(this.syncedControllerAddress);
    },
    accountName() {
      return cut(this.stakingNetwork.stashName);
    },
    stakingAssetPrice() {
      const priceId = this.stakingCurrency?.priceId ?? '';

          return this.networksStore.getAssetPrice(priceId).price;
    },
    valueString() {
      const value = +this.fee * this.stakingAssetPrice;

          return `${this.accountsStore.fiatSymbol}${this.$n(+value, 'price')}`;
    },
    syncedControllerAddress: {
      get() {
        return this.controllerAddress;
      },
      set(value) {
        this.$emit('update:controllerAddress', value);
      },
    },
  },
  methods: {
    setControllerAddress(value = '') {
      this.syncedControllerAddress = value;
    },
  },
});
</script>

<style lang="scss" scoped>
.controller-account {
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  .info-fee {
    margin-top: 10px;
    margin-bottom: 20px;
  }

  .hint {
    margin: 15px 0;
  }

  .row {
    margin-left: 15px;
  }

  .already-controlling {
    margin: 10px 0;
  }
}
</style>
