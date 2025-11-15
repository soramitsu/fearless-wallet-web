<template>
  <div class="header-pool">
    <DoubleAssetHighlightIcon
      :icon1="icon1"
      :icon2="icon2"
      :shadowColor1="color1"
      :shadowColor2="color2"
      :size="size"
    />

    <div v-if="step !== 3" class="pool-descriptions">
      <div class="pool-name" data-testid="poolName">
        {{ poolName }}

        <Icon icon="pool" class="pool-icon" :hover="false" />
      </div>

      <div class="tvl" data-testid="tvl">{{ tvl }} TVL</div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import type { PoolParams } from '@/stores';
import { useAccountsStore } from '@/stores/accounts';

const props = defineProps<{
  poolParams: PoolParams;
  step: number;
}>();

const accountsStore = useAccountsStore();
const { n, t } = useI18n();

const size = computed(() => (props.step === 3 ? 'big' : 'small'));

const tvl = computed(() => {
  const tvlValue = +(props.poolParams?.tvl ?? 0);

  return `${accountsStore.fiatSymbol}${n(tvlValue, 'price')}`;
});

const icon1 = computed(() => props.poolParams?.asset1.icon ?? '');
const icon2 = computed(() => props.poolParams?.asset2.icon ?? '');
const color1 = computed(() => props.poolParams?.asset1.color ?? '');
const color2 = computed(() => props.poolParams?.asset2.color ?? '');

const poolName = computed(() => {
  const asset1 = props.poolParams?.asset1.name.toUpperCase();
  const asset2 = props.poolParams?.asset2.name.toUpperCase();

  return `${asset1}-${asset2} ${t('pools.pool')}`;
});
</script>

<style lang="scss" scoped>
.header-pool {
  display: flex;
  padding: 25px 20px;
  justify-content: center;

  .pool-descriptions {
    display: flex;
    flex-direction: column;
    text-align: left;
    margin-left: 10px;
    flex: 1;
    color: $default-white;

    .pool-name {
      display: flex;
      align-items: center;
      font-weight: 700;
      font-size: 1.5em;
      line-height: 35px;
    }

    .pool-icon {
      margin-left: 5px;
      width: 24px;
      height: 24px;
    }

    .tvl {
      color: $gray-color;
      font-size: 0.875em;
    }
  }
}
</style>
