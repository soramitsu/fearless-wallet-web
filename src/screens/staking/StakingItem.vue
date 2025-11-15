<template>
  <div class="staking-item" data-testid="stakingItem" @click="click">
    <div class="description-part left-part">
      <ExternalLogo :name="icon" class="network-icon" />

      <div class="network-description">
        <div class="stake-name" data-testid="stakeName">{{ $t(`staking.${type}`) }}</div>

        <div class="network-name" data-testid="networkName">{{ network }}</div>
      </div>
    </div>

    <div class="description-part right-part">
      <div class="values">
        <Shimmer v-if="isLoading" height="12px" width="135px" />

        <div v-else class="unstaking" data-testid="unstaking">{{ $t('staking.unstakingDays', days) }}</div>

        <Shimmer v-if="isLoading" height="20px" width="155px" />

        <div v-else class="apy" data-testid="apy">{{ apy }} APY</div>

        <Shimmer v-if="isLoading" height="12px" width="55px" />

        <div v-else class="min-bond" data-testid="minBond">{{ $t('common.min') }} {{ minBond }} {{ asset }}</div>
      </div>

      <Icon icon="chevron-right" class="chevron" data-testid="chevronRight" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { APIItemState } from '@extension-base/api/types/networks';
import type { NetworkParams } from '@/stores';
import { balanceMatchesNetwork } from '@/helpers';
import { useAccountsStore } from '@/stores/accounts';

const props = defineProps<{
  stakingNetwork: NetworkParams;
}>();

const emit = defineEmits<{
  click: [];
}>();

const accountsStore = useAccountsStore();
const { n } = useI18n();

const network = computed(() => props.stakingNetwork.network);
const assetId = computed(() => props.stakingNetwork.assetId);

const stakingCurrency = computed(() => accountsStore.balances?.find(({ groupId }) => groupId === assetId.value));

const balanceIsReady = computed(() => {
  const networkBalance = stakingCurrency.value?.balances?.find((balance) =>
    balanceMatchesNetwork(balance, network.value)
  );

  return networkBalance?.state === APIItemState.READY;
});

const isLoading = computed(() => !balanceIsReady.value);

const apy = computed(() => `${n(props.stakingNetwork.apy, 'price')}%`);
const asset = computed(() => props.stakingNetwork.asset.toUpperCase());
const icon = computed(() => props.stakingNetwork.icon);
const minBond = computed(() => props.stakingNetwork.minBond);
const type = computed(() => props.stakingNetwork.type);
const days = computed(() => ({ value: props.stakingNetwork.unbondPeriod }));

function click() {
  if (!isLoading.value) emit('click');
}
</script>

<style lang="scss" scoped>
.staking-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: $default-border;
  height: 80px;
  padding: 8px 0 8px 14px;
  margin-right: 16px;
  user-select: none;
  cursor: pointer;

  .left-part {
    justify-content: start;
    text-transform: uppercase;

    .network-icon {
      margin-right: 13px;
    }

    .network-description {
      display: flex;
      justify-content: space-between;
      flex-direction: column;
      text-align: left;

      .stake-name {
        font-size: 0.75rem;
        font-weight: 700;
        color: $default-white;
      }

      .network-name {
        font-size: 1.25rem;
        font-weight: 700;
        line-height: 25px;
      }
    }
  }

  .right-part {
    justify-content: end;

    .chevron {
      width: 30px;
      height: 30px;
      margin-left: 8px;
      color: $grayish-white-2;
    }

    .unstaking {
      font-size: 0.75rem;
      font-weight: 400;
      color: $default-white;
    }

    .apy {
      font-size: 1.25rem;
      font-weight: 700;
      line-height: 25px;
      color: $pink-lavender-color;
    }

    .min-bond {
      font-size: 0.75rem;
      color: $default-white;
    }

    .values {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      justify-content: space-between;
      height: 55px;
    }
  }

  .description-part {
    display: flex;
    align-items: center;
  }
}
</style>
