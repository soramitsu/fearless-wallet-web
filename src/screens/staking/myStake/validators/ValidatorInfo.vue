<template>
  <Scroll>
    <div class="validator-info">
      <FInput
        :value="address"
        :placeholder="validatorName"
        size="big"
        data-testid="validatorNameInput"
        :readonly="true"
      />

      <ContentForm :height="validatorFormHeight" :isStaticHeight="true" :bottomRightCorner="true" class="about-staking">
        <div class="label" data-testid="stakingLabel">{{ $t('browserTabs.staking') }}</div>

        <InfoRow text="common.status" data-testid="status" :value="status" :showBorder="!showSlashedWarning" />

        <Hint v-if="showSlashedWarning" iconName="warning" text="staking.validatorSlashed" class="hint" />

        <InfoRow
          text="staking.nominators"
          data-testid="nominators"
          :value="`${nominatorsCount} (${$t('common.max')} ${maxNominatorRewardedPerValidator})`"
          borderType="default"
          :showBorder="!showOversubscribedWarning"
        />

        <Hint v-if="showOversubscribedWarning" iconName="warning" text="staking.oversubscribedOnly" />

        <InfoRow
          text="staking.totalStake"
          data-testid="totalStake"
          :value="`${totalStakeString} ${stakingAssetName}`"
          :price="totalStakeValue"
        />

        <InfoRow
          text="staking.estimatedRewards"
          data-testid="estimatedRewards"
          :value="`${apy}% APY`"
          borderType="default"
        />
      </ContentForm>

      <ContentForm :height="315" :isStaticHeight="true" :bottomRightCorner="true">
        <Scroll>
          <div class="form-layout">
            <div class="label" data-testid="identityLabel">{{ $t('staking.identity') }}</div>

            <InfoRow text="staking.legalName" :value="legalName" borderType="default" data-testid="legalName" />

            <InfoRow
              text="common.email"
              :value="email"
              borderType="default"
              color="pink-lavender"
              data-testid="email"
            />

            <InfoRow text="staking.web" :value="web" borderType="default" color="pink-lavender" data-testid="web" />

            <InfoRow
              text="common.twitter"
              :value="twitter"
              borderType="default"
              color="pink-lavender"
              data-testid="twitter"
            />

            <InfoRow
              text="staking.elementName"
              :value="elementName"
              borderType="default"
              color="pink-lavender"
              data-testid="elementName"
            />
          </div>
        </Scroll>
      </ContentForm>
    </div>
  </Scroll>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import Scroll from '@/components/Scroll.vue';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

export default defineComponent({ name: 'ValidatorInfo',
  components: { Scroll },
  props: {
    stakingNetwork: { type: Object },
    stakingCurrency: { type: Object },
    validator: { type: Object },
    validators: { type: Array },
  },
  data() {
    return {
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
    };
  },
  computed: {
    validatorFormHeight() {
      const sub = this.showOversubscribedWarning ? 0 : 55;
          const sub2 = this.showSlashedWarning ? 0 : 55;

          return 355 - sub - sub2;
    },
    stakingAssetName() {
      return this.stakingCurrency.symbol;
    },
    showOversubscribedWarning() {
      return this.validator.isOversubscribed;
    },
    showSlashedWarning() {
      // TODO staking
          return false;
          // return this.validator.isSlashed;
    },
    address() {
      return this.validator.address;
    },
    validatorName() {
      return this.validator.name;
    },
    nominatorsCount() {
      return this.validator.nominators.length;
    },
    legalName() {
      return this.validator.identity?.info.legal;
    },
    email() {
      return this.validator.identity?.info.email;
    },
    web() {
      return this.validator.identity?.info.web;
    },
    twitter() {
      return this.validator.identity?.info.twitter;
    },
    status() {
      return this.$t(`staking.${this.validator.status}`);
    },
    elementName() {
      return this.validator.identity?.info.description;
    },
    maxNominatorRewardedPerValidator() {
      return this.stakingNetwork.maxNominatorRewardedPerValidator;
    },
    stakingAssetPrice() {
      const priceId = this.stakingCurrency?.priceId ?? '';

          return this.networksStore.getAssetPrice(priceId).price;
    },
    apy() {
      return this.validator?.apy;
    },
    totalStake() {
      return this.validator.stake.total ?? '0';
    },
    totalStakeString() {
      return this.$n(+this.totalStake, 'decimal');
    },
    totalStakeValue() {
      const value = +this.totalStake * this.stakingAssetPrice;

          return `${this.accountsStore.fiatSymbol}${this.$n(+value, 'price')}`;
    },
  },
});
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
