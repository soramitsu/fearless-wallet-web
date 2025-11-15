<template>
  <FCorners size="big" :isSelected="isSelected">
    <div :class="selectClasses">
      <div class="column left-column">
        <div class="header" data-testid="headerSelectInput">{{ header }}</div>

        <input
          v-model="amountInternal"
          placeholder="0.00"
          :readonly="readonly"
          data-testid="amountInternal"
          @focus="setFocusValue(true)"
          @blur="setFocusValue(false)"
          @keypress="IsNumber"
        />

        <div class="price" data-testid="fiatAmount">{{ accountsStore.fiatSymbol }}{{ valueCut }}</div>
      </div>

      <div class="column right-column">
        <FCorners class="FCorners-button" @click="click">
          <button data-testid="selectBtn" :class="selectButtonClasses">
            <template v-if="asset !== ''">
              <ExternalLogo class="asset-icon" :name="assetIcon" :width="32" />

              <div class="asset" data-testid="asset">{{ asset.toUpperCase() }}</div>
            </template>

            <div v-else class="select-label">Select</div>

            <Rotate v-if="showIconRotate" :isActive="syncedIsRotate" class="rotate-asset">
              <SIcon name="chevron-bottom-16" data-testid="rotateAsset" />
            </Rotate>
          </button>
        </FCorners>

        <div v-if="showBalance" class="balance" data-testid="balance">
          {{ $t('assets.balance') }}

          <div :class="balanceValueClasses" data-testid="balanceValue" @click="setMax">
            &nbsp;{{ $n(+totalAmount, 'decimal') }}
          </div>
        </div>
      </div>
    </div>
  </FCorners>
</template>

<script lang="ts" setup>
import { computed, ref, toRefs } from 'vue';
import { useI18n } from 'vue-i18n';
import { FPNumber } from '@/lib/fpNumber';
import { useAccountsStore } from '@/stores/accounts';

type Props = {
  text?: string;
  asset?: string;
  assetId?: string;
  value?: string;
  totalAmount?: number;
  showBalance?: boolean;
  readonly?: boolean;
  showIcon?: boolean;
  showOriginValue?: boolean;
  amount: string;
  isRotate: boolean;
};

const emit = defineEmits<{
  (_event: 'setMax'): void;
  (_event: 'togglePopupVisibility'): void;
  (_event: 'update:amount', _value: string): void;
  (_event: 'update:isRotate', _value: boolean): void;
}>();

const rawProps = withDefaults(defineProps<Props>(), {
  text: '',
  asset: '',
  assetId: '',
  value: '',
  totalAmount: 0,
  showBalance: true,
  readonly: false,
  showIcon: true,
  showOriginValue: false,
  amount: '',
  isRotate: false,
});

const { t, n } = useI18n();
const accountsStore = useAccountsStore();
const inputIsFocused = ref(false);

const { text, asset, assetId, value, totalAmount, showBalance, readonly, showIcon, showOriginValue, amount, isRotate } =
  toRefs(rawProps);

const syncedAmount = computed({
  get: () => amount.value,
  set: (val: string) => emit('update:amount', val),
});

const syncedIsRotate = computed({
  get: () => isRotate.value,
  set: (val: boolean) => emit('update:isRotate', val),
});

const showIconRotate = computed(() => showIcon.value && !readonly.value);
const isSelected = computed(() => inputIsFocused.value && !readonly.value);
const header = computed(() => t(text.value));

const amountInternal = computed({
  get: () => {
    if (syncedAmount.value === '') return '';

    if (showOriginValue.value) return syncedAmount.value;

    if (syncedAmount.value.includes('.')) {
      const [wholePart, fractionalPart] = syncedAmount.value.split('.');
      const localString = FPNumber.fromCodecValue(wholePart || 0, 0).toLocaleString();

      if (syncedAmount.value.endsWith('.')) return `${localString}.`;

      if (localString === 'NaN') return syncedAmount.value;

      return `${localString}.${fractionalPart}`;
    }

    return FPNumber.fromCodecValue(syncedAmount.value || 0, 0).toLocaleString();
  },
  set: (_value: string) => {
    const normalizedValue = _value.replaceAll(',', '').replaceAll(' ', '');
    const previous = syncedAmount.value ?? '';

    if (normalizedValue.length < previous.length) {
      syncedAmount.value = normalizedValue;

      return;
    }

    if (FPNumber.fromCodecValue(normalizedValue || 0, 0).toLocaleString() !== 'NaN') {
      if (normalizedValue.includes('.')) {
        const [wholePart, fractionalPart] = normalizedValue.split('.');

        if (normalizedValue.endsWith('.')) {
          syncedAmount.value = `${wholePart}.`;

          return;
        }

        syncedAmount.value = `${wholePart}.${fractionalPart}`;

        return;
      }

      syncedAmount.value = normalizedValue;
    }
  },
});

const tokenGroup = computed(() => accountsStore.balances.find(({ groupId }) => groupId === assetId.value));
const assetIcon = computed(() => tokenGroup.value?.icon);
const valueCut = computed(() => n(Number(value.value), 'price'));

const balanceValueClasses = computed(() => [
  'balance-value',
  {
    'balance-value-readonly': readonly.value,
  },
]);

const selectButtonClasses = computed(() => [
  'select-button',
  {
    'select-button-readonly': readonly.value,
  },
]);

const selectClasses = computed(() => [
  'select',
  {
    'select-focused': inputIsFocused.value && !readonly.value,
  },
]);

const IsNumber = (event: KeyboardEvent) => {
  if (!/\d/.test(event.key) && event.key !== '.') event.preventDefault();
};

const setFocusValue = (value: boolean) => {
  inputIsFocused.value = value;

  if (!value) {
    const [wholePart, fractionalPart] = syncedAmount.value.split('.');

    if (fractionalPart !== undefined && Number(fractionalPart) === 0) {
      syncedAmount.value = wholePart;
    }
  }
};

const setMax = () => {
  if (readonly.value) return;

  emit('setMax');
};

const click = () => {
  if (readonly.value) return;

  emit('togglePopupVisibility');
};
</script>

<style lang="scss" scoped>
.select-focused {
  border: 1px solid #7700ee !important;
}

.select {
  padding: 16px;
  width: 100%;
  height: 96px;
  background-color: $secondary-background-color;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border-radius: $default-border-radius;
  border: $secondary-border;
  display: flex;
  justify-content: space-between;
  color: $gray-color;

  .column {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    max-width: 250px;
  }

  .left-column {
    text-align: left;

    .header {
      font-weight: 700;
      font-size: 0.75rem;
      text-transform: uppercase;
    }

    .price {
      font-size: 0.75rem;
    }

    input {
      margin: 5px 0;
      background: none;
      border: none;
      outline: none;
      color: white;
      width: 250px;
      font-weight: 700;
      font-size: 1.25rem;
    }

    // hide arrows
    /* Chrome, Safari, Edge, Opera */
    input::-webkit-outer-spin-button,
    input::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }

    /* Firefox */
    input[type='number'] {
      -moz-appearance: textfield;
    }
  }

  .select-label {
    color: $gray-color;
  }

  .right-column {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    justify-content: center;

    .FCorners-button {
      width: fit-content;
    }

    .select-button {
      display: flex;
      justify-content: center;
      align-items: center;
      clip-path: $medium-clip-path-left-top-and-right-bottom;
      height: 42px;
      min-width: 100px;
      background-color: $secondary-background-color;
      color: white;
      border: $default-border;
      border-radius: 4px;
      min-width: 122px;
      cursor: pointer;

      .asset-icon {
        border-radius: 50%;
        height: 24px !important;
        width: 24px !important;
      }

      .asset {
        margin-left: 5px;
      }

      .rotate-asset {
        margin-left: 5px;
      }

      .s-icon-chevron-bottom-16 {
        color: $gray-color;
      }
    }

    .select-button-readonly {
      cursor: default;
      // opacity: 0.5;
    }

    .balance {
      display: flex;
      font-size: 0.75rem;
      user-select: none;
      max-width: 250px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-top: 5px;

      .balance-value {
        cursor: pointer;
        color: $pink-lavender-color;
      }

      .balance-value-readonly {
        cursor: default;
      }
    }
  }
}

.fw-web {
  .select {
    .left-column {
      input {
        width: 100%;
      }
    }
  }
}
</style>
