<template>
  <div class="validator">
    <div class="left-part">
      <Identicon :address="validator.address" data-testid="address" class="ident" />

      <div data-testid="validatorName">{{ validator.name }}</div>
    </div>

    <div class="right-part">
      <div data-testid="rewards">{{ rewards }} {{ rewardedAsset }}</div>

      <div class="price" data-testid="fiatPrice">{{ accountsStore.fiatSymbol }}{{ price }}</div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ValidatorReward } from '@extension-base/services/staking-service/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

const props = defineProps<{
  validator: ValidatorReward;
  rewardedCurrency: TokenGroup;
}>();

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const { n } = useI18n();

const rewards = computed(() => n(+props.validator.rewards, 'decimal'));

const rewardedAssetPrice = computed(() => {
  const priceId = props.rewardedCurrency?.priceId ?? '';

  return networksStore.getAssetPrice(priceId).price;
});

const rewardedAsset = computed(() => props.rewardedCurrency.symbol);

const price = computed(() => {
  const value = +props.validator.rewards * rewardedAssetPrice.value;

  return n(value, 'price');
});
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
      font-size: 0.75rem;
    }
  }
}
</style>
