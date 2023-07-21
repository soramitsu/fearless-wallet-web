<template>
  <div class="unstaking-form">
    <div class="descriptions">
      <div class="fee">
        {{ $t('assets.networkFee') }}

        <div class="column">
          <div class="amount">{{ fee }} {{ asset }}</div>

          <div class="value">{{ fiatSymbol }}{{ feeValue }}</div>
        </div>
      </div>

      <div class="disclaimer">
        <Icon icon="wallet-2" class="img" />

        {{ $t('staking.unstakingDisclaimers1') }}
      </div>

      <div class="disclaimer">
        <Icon icon="logout" class="img" />

        {{ $t('staking.unstakingDisclaimers2') }}
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { GetAssetPrice } from '@/store';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';

@Component
export default class UnstakingForm extends Vue {
  fee = 1;

  @Prop({ type: Object }) currency!: TokenBalance;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;

  get asset() {
    return this.currency.symbol;
  }

  get feePrice() {
    const priceId = this.currency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get feeValue() {
    return this.fee * this.feePrice;
  }
}
</script>

<style lang="scss" scoped>
.unstaking-form {
  .descriptions {
    .fee {
      font-size: 14px;
      border-bottom: $default-border;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 10px 0 20px;
      padding: 10px 16px;

      .column {
        display: flex;
        flex-direction: column;
        align-items: flex-end;

        .amount {
          font-weight: 600;
          text-align: right;
          text-transform: uppercase;
          margin-bottom: 5px;
        }

        .value {
          font-size: 12px;
          text-align: right;
          color: $grayish-white-2;
        }
      }
    }

    .disclaimer {
      display: flex;
      align-items: center;
      font-size: 14px;
      color: #ffffffbf;
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
}
</style>
