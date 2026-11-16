<template>
  <ContentForm class="direction-form">
    <div class="direction">
      <div class="column left-column">
        <div class="amount" data-testid="sendAmount">{{ amount1Cut }}</div>
        <div class="price" data-testid="sendPrice">{{ value1Cut }}</div>
      </div>

      <div class="partition">
        <div class="hr"></div>

        <div class="direction-icon" data-testid="directionIcon">
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
import { computed } from 'vue';
import { useI18n } from '@/locales/useI18n';
import { useAccountsStore } from '@/stores/accounts';

interface Props {
  isExchangeB?: boolean;
  asset1: string;
  asset2: string;
  amount1: string;
  amount2: string;
  /**
   * The fiat value of each amount, worked out by the screen from the portfolio's trusted price of that asset
   * (getTransferAssetPrice). `null`, the default, means the asset has no trusted price: "Price unavailable", never $ 0.00.
   */
  value1?: string | null;
  value2?: string | null;
  icon?: string;
}

const props = withDefaults(defineProps<Props>(), {
  isExchangeB: false,
  asset1: '',
  asset2: '',
  amount1: '',
  amount2: '',
  value1: null,
  value2: null,
  icon: 'chevron-right',
});

const { n, t } = useI18n();
const accountsStore = useAccountsStore();

const directionIcons = computed(() => [
  'img',
  {
    'img-margin': props.icon === 'chevron-right',
  },
]);

const amount1Cut = computed(() => `${n(+props.amount1, 'decimal')} ${props.asset1.toUpperCase()}`);
const amount2Cut = computed(() => `${n(+props.amount2, 'decimal')} ${props.asset2.toUpperCase()}`);

const fiatSymbol = computed<string>(() => accountsStore.fiatSymbol);

const valueCut = (value: string | null) =>
  value === null ? t('portfolioPage.priceUnavailable') : `${fiatSymbol.value} ${n(+value, 'price')}`;

const value1Cut = computed(() => valueCut(props.value1));
const value2Cut = computed(() => valueCut(props.value2));
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
        font-size: 1.375em;
        color: white;
        margin-bottom: 5px;

        .price {
          font-size: 0.75rem;
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
        border-left: 2px solid palette($secondary-background-color, var(--fw-divider));
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
