<template>
  <Scroll>
    <div class="validator-info">
      <Input v-model="address" :placeholder="validatorName" size="big" :readonly="true" />

      <ContentForm :height="355" :isStaticHeight="true" :bottomRightCorner="true" class="about-staking">
        <div class="label">{{ $t('staking.staking') }}</div>

        <InfoRow text="common.status" :value="status" :showBorder="false" />

        <Hint iconName="warning" text="staking.validatorSlashed" class="hint" />

        <InfoRow
          text="staking.nominators"
          :value="`${nominators} (${$t('common.max')} ${maxNominators})`"
          borderType="default"
          :showBorder="false"
        />

        <Hint iconName="warning" text="staking.oversubscribedOnly" />

        <InfoRow
          text="staking.totalStake"
          :value="`${totalStake} ${stakingAsset}`"
          :price="`${fiatSymbol} ${totalStakeValue}`"
        />

        <InfoRow text="staking.estimatedRewards" :value="`${apy}% APY`" borderType="default" />
      </ContentForm>

      <ContentForm :height="100" :isStaticHeight="true" :bottomRightCorner="true">
        <Scroll>
          <div class="form-layout">
            <div class="label">{{ $t('staking.identity') }}</div>
          </div>
        </Scroll>
      </ContentForm>
    </div>
  </Scroll>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { validators } from '../validators/mock';
import type { GetAssetPrice } from '@/store';
import type { TokenBalance } from '@extension-base/background/types/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import Scroll from '@/components/Scroll.vue';

@Component({
  components: { Scroll },
})
export default class ValidatorInfo extends Vue {
  validators = validators;

  @Prop({ type: String }) address!: string;
  @Prop({ type: Object }) stakingCurrency!: TokenBalance;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;

  get validatorName() {
    return this.validatorInfo.name;
  }

  get validatorInfo() {
    return this.validators.find(({ address }) => address === this.address)!;
  }

  get nominators() {
    return 139;
  }

  get status() {
    return 'Elected';
  }

  get maxNominators() {
    return 256;
  }

  get stakingAssetPrice() {
    const priceId = this.stakingCurrency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get apy() {
    return this.validatorInfo?.apy;
  }

  get totalStake() {
    return 19.1;
  }

  get totalStakeValue() {
    const value = this.totalStake * this.stakingAssetPrice;

    return `${this.fiatSymbol}${this.$n(+value, 'price')}`;
  }

  get stakingAsset() {
    return this.stakingCurrency.symbol;
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
