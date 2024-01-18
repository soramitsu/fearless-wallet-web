<template>
  <Scroll>
    <div class="validator-info">
      <FInput v-model="address" :placeholder="validatorName" size="big" :readonly="true" />

      <ContentForm :height="validatorFormHeight" :isStaticHeight="true" :bottomRightCorner="true" class="about-staking">
        <div class="label">{{ $t('browserTabs.staking') }}</div>

        <InfoRow text="common.status" :value="status" :showBorder="!showSlashedWarning" />

        <Hint v-if="showSlashedWarning" iconName="warning" text="staking.validatorSlashed" class="hint" />

        <InfoRow
          text="staking.nominators"
          :value="`${nominatorsCount} (${$t('common.max')} ${maxNominatorRewardedPerValidator})`"
          borderType="default"
          :showBorder="!showOversubscribedWarning"
        />

        <Hint v-if="showOversubscribedWarning" iconName="warning" text="staking.oversubscribedOnly" />

        <InfoRow
          text="staking.totalStake"
          :value="`${totalStakeString} ${stakingAssetName}`"
          :price="totalStakeValue"
        />

        <InfoRow text="staking.estimatedRewards" :value="`${apy}% APY`" borderType="default" />
      </ContentForm>

      <ContentForm :height="315" :isStaticHeight="true" :bottomRightCorner="true">
        <Scroll>
          <div class="form-layout">
            <div class="label">{{ $t('staking.identity') }}</div>

            <InfoRow text="staking.legalName" :value="legalName" borderType="default" />

            <InfoRow text="common.email" :value="email" borderType="default" color="pink-lavender" />

            <InfoRow text="staking.web" :value="web" borderType="default" color="pink-lavender" />

            <InfoRow text="common.twitter" :value="twitter" borderType="default" color="pink-lavender" />

            <InfoRow text="staking.elementName" :value="elementName" borderType="default" color="pink-lavender" />
          </div>
        </Scroll>
      </ContentForm>
    </div>
  </Scroll>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { FWValidatorInfoFull } from '@extension-base/services/staking-service/types';
import type { GetAssetPrice, NetworkParams } from '@/store';
import type { TokenBalance } from '@extension-base/background/types/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import Scroll from '@/components/Scroll.vue';

@Component({
  components: { Scroll },
})
export default class ValidatorInfo extends Vue {
  @Prop({ type: Object }) stakingNetwork!: NetworkParams;
  @Prop({ type: Object }) validator!: FWValidatorInfoFull;
  @Prop({ type: Object }) stakingCurrency!: TokenBalance;
  @Prop({ type: Array }) validators!: FWValidatorInfoFull[];
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;

  get validatorFormHeight() {
    const sub = this.showOversubscribedWarning ? 0 : 55;
    const sub2 = this.showSlashedWarning ? 0 : 55;

    return 355 - sub - sub2;
  }

  get stakingAssetName() {
    return this.stakingCurrency.symbol;
  }

  get showOversubscribedWarning() {
    return this.validator.isOversubscribed;
  }

  get showSlashedWarning() {
    // TODO staking
    return false;
    // return this.validator.isSlashed;
  }

  get address() {
    return this.validator.address;
  }

  get validatorName() {
    return this.validator.name;
  }

  get nominatorsCount() {
    return this.validator.nominators.length;
  }

  get legalName() {
    return this.validator.identity?.info.legal;
  }

  get email() {
    return this.validator.identity?.info.email;
  }

  get web() {
    return this.validator.identity?.info.web;
  }

  get twitter() {
    return this.validator.identity?.info.twitter;
  }

  get status() {
    return this.$t(`staking.${this.validator.status}`);
  }

  get elementName() {
    return this.validator.identity?.info.description;
  }

  get maxNominatorRewardedPerValidator() {
    return this.stakingNetwork.maxNominatorRewardedPerValidator;
  }

  get stakingAssetPrice() {
    const priceId = this.stakingCurrency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get apy() {
    return this.validator?.apy;
  }

  get totalStake() {
    return this.validator.stake.total ?? '0';
  }

  get totalStakeString() {
    return this.$n(+this.totalStake, 'decimal');
  }

  get totalStakeValue() {
    const value = +this.totalStake * this.stakingAssetPrice;

    return `${this.fiatSymbol}${this.$n(+value, 'price')}`;
  }
}
</script>

<style lang="scss" scoped>
.validator-info {
  .label {
    margin: 16px 16px 0;
    font-weight: 600;
    text-align: left;
    color: $default-white;
  }

  .about-staking {
    margin: 15px 0;
  }

  .hint {
    margin: 0 16px;
    border-bottom: $default-border;
    padding-bottom: 10px;
  }
}
</style>
