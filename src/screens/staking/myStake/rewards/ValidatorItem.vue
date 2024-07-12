<template>
  <div class="validator">
    <div class="left-part">
      <Identicon :address="validator.address" data-testid="address" class="ident" />

      <div data-testid="validatorName">{{ validator.name }}</div>
    </div>

    <div class="right-part">
      <div data-testid="rewards">{{ rewards }} {{ rewardedAsset }}</div>

      <div class="price" data-testid="fiatPrice">{{ fiatSymbol }}{{ price }}</div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { type ValidatorReward } from '@extension-base/services/staking-service/types';
import type { GetAssetPrice } from '@/store';
import type { TokenGroup } from '@extension-base/background/types/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';

@Component
export default class ValidatorItem extends Vue {
  @Prop({ type: Object }) validator!: ValidatorReward;
  @Prop({ type: Object }) rewardedCurrency!: TokenGroup;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;

  get rewards() {
    return this.$n(+this.validator.rewards, 'decimal');
  }

  get rewardedAssetPrice() {
    const priceId = this.rewardedCurrency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get rewardedAsset() {
    return this.rewardedCurrency.symbol;
  }

  get price() {
    const value = +this.validator.rewards * this.rewardedAssetPrice;

    return this.$n(value, 'price');
  }

  onSelect(value: boolean) {
    this.$emit('onSelect', value, this.validator.address);
  }
}
</script>

<style lang="scss" scoped>
.validator {
  padding: 10px 0;
  border-bottom: $default-border;
  display: flex;
  justify-content: space-between;
  color: $default-white;
  width: 100%;

  &:last-child {
    border: none;
  }

  .left-part {
    display: flex;
    align-items: center;

    .ident {
      margin: 0 10px;
    }

    .validator-checkbox {
      height: 36px;
    }
  }

  .right-part {
    display: flex;
    align-items: flex-end;
    text-transform: uppercase;
    flex-direction: column;

    .price {
      color: $gray-color;
      margin-top: 3px;
      font-size: 12px;
    }
  }
}
</style>
