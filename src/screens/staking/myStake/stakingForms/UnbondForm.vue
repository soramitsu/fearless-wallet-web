<template>
  <div class="unbond-form">
    <div class="buttons">
      <div
        v-for="{ label, value } in unbondValues"
        :key="value"
        :class="getUnbondClasses(value)"
        @click="setUnbond(value)"
      >
        {{ label }}
      </div>
    </div>

    <InfoRow
      class="info-fee"
      text="assets.networkFee"
      :value="`${fee} ${asset}`"
      :price="valueString"
      :hideLastBorder="false"
      textSize="mini"
      borderType="default"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { GetAssetPrice } from '@/store';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';

@Component
export default class UnbondForm extends Vue {
  readonly selectAccountInputRef = 'selectAccountInput';
  readonly unbondValues = [
    // { label: `${this.$t('staking.latestUnstake')}: ${this.lastUnstake} ${this.asset}`, value: 100 },
    { label: '100%', value: 100 },
    { label: '75%', value: 75 },
    { label: '50%', value: 50 },
    { label: '25%', value: 25 },
  ];

  unbondParameter = 0;

  @Prop({ type: Object }) stakingCurrency!: TokenBalance;
  @Prop({ type: String }) fee!: string;
  @Prop({ type: String }) amount!: string;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;

  get lastUnstake() {
    return '1.1';
  }

  get asset() {
    return this.stakingCurrency.symbol;
  }

  get stakingAssetPrice() {
    const priceId = this.stakingCurrency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get valueString() {
    const value = +this.fee * this.stakingAssetPrice;

    return `${this.fiatSymbol}${this.$n(+value, 'price')}`;
  }

  get amountByPercent() {
    const value = this.unbondParameter / 100;

    return (+this.lastUnstake * value).toString();
  }

  @Watch('amount')
  amountChanged() {
    if (this.amount !== this.amountByPercent) this.unbondParameter = 0;
  }

  getUnbondClasses(value: number) {
    return [
      'button',
      {
        'selected-button': value === this.unbondParameter,
      },
    ];
  }

  setUnbond(value: number) {
    this.unbondParameter = value;

    this.$emit('updateAmount', this.amountByPercent);
  }
}
</script>

<style lang="scss" scoped>
.unbond-form {
  margin-top: 15px;

  .buttons {
    display: flex;
    color: $default-white;

    .button {
      text-transform: uppercase;
      background: $secondary-background-color;
      border-radius: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8px 10px;
      font-weight: 700;
      font-size: 12px;
      margin-right: 16px;
      cursor: pointer;
      user-select: none;
      width: 60px;

      &:hover {
        border: $default-border;
      }
    }

    .selected-button {
      background-color: $pink-purple-color;
    }
  }

  .info-fee {
    margin-bottom: 20px;
  }

  .disclaimer {
    display: flex;
    align-items: center;
    font-size: 14px;
    color: $default-white;
    margin-bottom: 10px;

    &:last-child {
      margin-bottom: none;
    }
  }

  .img {
    margin-right: 10px;
    height: 30px;
    width: 30px;
  }
}
</style>
