<template>
  <ContentForm class="direction-form">
    <div class="direction">
      <div class="column left-column">
        <div class="amount" data-testid="sendAmount">{{ amount1Cut }}</div>
        <div class="price" data-testid="sendPrice">{{ value1Cut }}</div>
      </div>

      <div class="partition">
        <div class="hr"></div>

        <div class="direction-icon">
          <Icon :icon="icon" :class="directionIcons" />
        </div>
      </div>

      <div class="column right-column">
        <div class="amount" data-testid="receiveAmount">{{ amount2Cut }}</div>
        <div class="price" data-testid="receivePrice">{{ value2Cut }}</div>
      </div>
    </div>
  </ContentForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { GetAssetPrice } from '@/store';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { getCostOfAssets } from '@/controllers/transferHelpers';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';

@Component({})
export default class DirectionContentForm extends Vue {
  @Prop(Boolean) isExchangeB!: boolean;
  @Prop(String) asset1!: string;
  @Prop(String) asset2!: string;
  @Prop(String) amount1!: string;
  @Prop(String) amount2!: string;
  @Prop(String) value1!: string;
  @Prop(String) value2!: string;
  @Prop(String) priceId1!: string;
  @Prop(String) priceId2!: string;
  @Prop({ default: 'chevron-right' }) icon!: string;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;

  get directionIcons() {
    return [
      'img',
      {
        'img-margin': this.icon === 'chevron-right',
      },
    ];
  }

  get amount1Cut() {
    return `${this.$n(+this.amount1, 'decimal')} ${this.asset1.toUpperCase()}`;
  }

  get amount2Cut() {
    return `${this.$n(+this.amount2, 'decimal')} ${this.asset2.toUpperCase()}`;
  }

  get assetPrice1() {
    return this.getAssetPrice(this.priceId1).price;
  }

  get assetPrice2() {
    return this.getAssetPrice(this.priceId2).price;
  }

  get _value1() {
    return this.value1 ?? getCostOfAssets(+this.amount1 ?? 0, this.assetPrice1);
  }

  get _value2() {
    return this.value2 ?? getCostOfAssets(+this.amount2 ?? 0, this.assetPrice2);
  }

  get value1Cut() {
    return `${this.fiatSymbol} ${this.$n(+this._value1, 'price')}`;
  }

  get value2Cut() {
    return `${this.fiatSymbol} ${this.$n(+this._value2, 'price')}`;
  }
}
</script>

<style lang="scss" scoped>
.direction-form {
  margin-bottom: 10px !important;

  .direction {
    display: flex;
    justify-content: space-between;
    height: 95px;

    .column {
      display: flex;
      flex-direction: column;
      width: 245px;
      max-width: 220px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      padding: 24px 16px;

      .amount {
        font-weight: 800;
        font-size: 22px;
        color: white;
        margin-bottom: 5px;

        .price {
          font-size: 12px;
          color: $gray-color;
        }
      }
    }

    .left-column {
      text-align: left;
    }

    .right-column {
      text-align: right;
    }

    .partition {
      display: flex;
      flex-direction: column;
      align-items: center;

      .hr {
        height: 95px;
        width: 1px;
        border-left: 2px solid $secondary-background-color;
      }

      .direction-icon {
        border-radius: 50%;
        background-color: rgb(29, 29, 29);
        min-width: 46px;
        min-height: 46px;
        display: flex;
        justify-content: center;
        align-items: center;
        border: $secondary-border;
        opacity: 1;
        cursor: pointer;
        margin-top: -69.5px;
      }
    }
  }
}

.img {
  height: 20px;
  width: 20px;
  color: #ee0077;
}

.img-margin {
  margin-left: 4px;
}
</style>
