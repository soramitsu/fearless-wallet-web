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

<script lang="ts" setup>
import { computed, defineProps, withDefaults } from 'vue';
import { useI18n } from 'vue-i18n-composable';
import { type GetAssetPrice, useStore } from '@/store';
import { getCostOfAssets } from '@/controllers/transferHelpers';

interface Props {
  isExchangeB: boolean;
  asset1: string;
  asset2: string;
  amount1: string;
  amount2: string;
  value1: string;
  value2: string;
  priceId1: string;
  priceId2: string;
  icon?: string;
}

const props = withDefaults(defineProps<Props>(), {
  isExchangeB: false,
  asset1: '',
  asset2: '',
  amount1: '',
  amount2: '',
  value1: '',
  value2: '',
  priceId1: '',
  priceId2: '',
  icon: 'chevron-right',
});

const { t } = useI18n();
const store = useStore();

const directionIcons = computed(() => [
  'img',
  {
    'img-margin': props.icon === 'chevron-right',
  },
]);

const amount1Cut = computed(() => `${t(props.amount1, 'decimal')} ${props.asset1.toUpperCase()}`);
const amount2Cut = computed(() => `${t(props.amount2, 'decimal')} ${props.asset2.toUpperCase()}`);

const fiatSymbol = computed<string>(() => store.getters.fiatSymbol);
const getAssetPrice: GetAssetPrice = (priceId) => store.getters.getAssetPrice(priceId);

const assetPrice1 = computed(() => getAssetPrice(props.priceId1).price);
const assetPrice2 = computed(() => getAssetPrice(props.priceId2).price);

const _value1 = computed(() => props.value1 ?? getCostOfAssets(+props.amount1 ?? 0, assetPrice1.value));
const _value2 = computed(() => props.value2 ?? getCostOfAssets(+props.amount2 ?? 0, assetPrice2.value));

const value1Cut = computed(() => `${fiatSymbol.value} ${t(_value1.value, 'price')}`);
const value2Cut = computed(() => `${fiatSymbol.value} ${t(_value2.value, 'price')}`);
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
