<template>
  <div class="controller-account">
    <Hint text="staking.stashBond" iconName="notification" class="hint row" />

    <InputWithIcon
      v-model="addressCut"
      icon="close"
      placeholder="staking.controllerAccount"
      @click="setControllerAddress"
    />

    <div class="activity-buttons">
      <BadgeButton text="common.paste" @click="paste" />
    </div>

    <Hint text="staking.controllerUnbond" iconName="notification" class="hint row" />

    <InfoRow
      class="info-fee"
      text="assets.networkFee"
      borderType="default"
      icon="info"
      :value="`${fee} ${asset}`"
      :price="valueString"
      :hideLastBorder="false"
      :iconClasses="['network-fee']"
    />

    <Tooltip text="assets.networkFee" target=".network-fee" placement="right" />

    <FLink text="staking.learnAboutControllers" class="about-controllers row" @click="openAboutControllers" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, PropSync } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { NetworkName } from '@/interfaces';
import type { SelectedWallet, GetAssetPrice } from '@/store';
import type { TokenBalance } from '@extension-base/background/types/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { cut, getClipboard } from '@/helpers';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';

@Component
export default class ControllerAccount extends Vue {
  @Prop({ type: String }) network!: NetworkName;
  @Prop({ type: String }) fee!: string;
  @Prop({ type: Object }) stakingCurrency!: TokenBalance;
  @PropSync('controllerAddress', { type: String }) syncedControllerAddress!: string;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;

  get asset() {
    return this.stakingCurrency.symbol;
  }

  get addressCut() {
    return cut(this.syncedControllerAddress);
  }

  get accountName() {
    return this.selectedWallet.name;
  }

  get stakingAssetPrice() {
    const priceId = this.stakingCurrency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get valueString() {
    const value = +this.fee * this.stakingAssetPrice;

    return `${this.fiatSymbol}${this.$n(+value, 'price')}`;
  }

  paste() {
    this.syncedControllerAddress = getClipboard();
  }

  setControllerAddress(value = '') {
    this.syncedControllerAddress = value;
  }

  openAboutControllers() {
    console.info('openAboutControllers');
  }
}
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

  .about-controllers {
    margin-top: 10px;
  }

  .activity-buttons {
    display: flex;
    user-select: none;
    margin-bottom: 15px;
  }
}
</style>
