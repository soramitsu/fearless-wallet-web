<template>
  <div class="pool-item" data-testid="poolItem" @click="click">
    <div class="icons" data-testid="poolIcons">
      <ExternalLogo :name="icon1" class="network-icon-1" />

      <ExternalLogo :name="icon2" class="network-icon-2" />
    </div>

    <div class="description-part">
      <diV class="descriptions">
        <div class="pool-name" data-testid="poolName">{{ poolName }}</div>

        <Shimmer v-if="isLoading" height="20px" width="155px" />

        <div v-else class="tvl" data-testid="poolTvl">{{ tvl }} TVL</div>
      </diV>

      <div class="values" data-testid="values">
        <div class="earn">
          Earn
          <p class="asset" data-testid="earnAsset">{{ asset2 }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { APIItemState } from '@extension-base/api/types/networks';
import type { PoolParams } from '@/stores';
import { useAccountsStore } from '@/stores/accounts';

const props = defineProps<{
  poolParams: PoolParams;
}>();

const emit = defineEmits<{
  click: [];
}>();

const accountsStore = useAccountsStore();
const { n } = useI18n();

const asset1 = computed(() => props.poolParams.asset1.symbol);
const asset2 = computed(() => props.poolParams.asset2.symbol);

const poolName = computed(() => `${asset1.value}-${asset2.value}`);

const tvl = computed(() => {
  const raw = Number.parseFloat(props.poolParams.tvl ?? '0');
  const numericTvl = Number.isFinite(raw) ? raw : 0;

  return `${accountsStore.fiatSymbol}${n(numericTvl, 'price')}`;
});

const isLoading = computed(
  () =>
    props.poolParams.loading ||
    props.poolParams.asset1.balanceState !== APIItemState.READY ||
    props.poolParams.asset2.balanceState !== APIItemState.READY
);

const icon1 = computed(() => props.poolParams.asset1.icon);
const icon2 = computed(() => props.poolParams.asset2.icon);

function click() {
  if (!isLoading.value) emit('click');
}
</script>

<style lang="scss" scoped>
.pool-item {
  display: flex;
  align-items: center;
  border-bottom: $default-border;
  height: 80px;
  user-select: none;
  cursor: pointer;

  .icons {
    display: flex;
    align-items: center;

    .network-icon-1 {
      margin-top: -5px;
    }

    .network-icon-2 {
      margin-top: 10px;
      margin-left: -17px;
    }
  }

  .description-part {
    display: flex;
    flex-direction: column;
    flex: 1;
    margin-left: 10px;

    .descriptions {
      display: flex;
      justify-content: space-between;

      .pool-name {
        text-transform: uppercase;
        color: $default-white;
      }
    }

    .values {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;

      .earn {
        display: flex;
        font-size: 0.75rem;
        color: $grayish-white-2;

        .asset {
          text-transform: uppercase;
          margin-left: 5px;
        }
      }
    }

    .chevron {
      width: 30px;
      height: 30px;
      margin-left: 8px;
      color: $grayish-white-2;
    }

    .tvl {
      font-weight: 600;
      color: $pink-lavender-color;
    }
  }
}
</style>
