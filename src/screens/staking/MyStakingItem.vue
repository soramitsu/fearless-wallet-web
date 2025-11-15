<template>
  <ContentForm :height="250" :isStaticHeight="true" :bottomRightCorner="true">
    <div class="my-staking-item" @click="openStakingInfo">
      <div class="header">
        <div class="description-part left-part">
          <ExternalLogo :name="icon" class="network-icon" />

          <div class="network-description">
            <div class="network-name" data-testid="networkName">{{ network }}</div>
          </div>
        </div>

        <div class="description-part right-part">
          <Loading v-if="isLoading" :width="28" />

          <template v-else>
            <div class="fiat" data-testid="fiat">{{ accountsStore.fiatSymbol }}{{ fiatValue }}</div>

            <Icon icon="chevron-right" class="chevron" data-testid="stakingDetails" />
          </template>
        </div>
      </div>

      <div class="row">
        <div data-testid="stakingBalanceTitle">
          {{ $t('staking.stakingBalance') }}
        </div>

        <Loading v-if="isLoading" :width="28" />

        <div v-else class="value" data-testid="stakingBalanceValue">{{ totalStake }} {{ asset }}</div>
      </div>

      <div class="row">
        <div data-testid="unstakingTitle">
          {{ $t('staking.unstaking') }}
        </div>

        <Loading v-if="isLoading" :width="28" />

        <div v-else class="value" data-testid="unstakingValue">{{ unbondAmount }} {{ asset }}</div>
      </div>

      <div class="row">
        <div data-testid="apyTitle">APY</div>

        <Loading v-if="isLoading" :width="28" />

        <div v-else class="value" data-testid="apyValue">{{ apy }}</div>
      </div>

      <div class="row">
        <div data-testid="unstakingPeriodTitle">
          {{ $t('staking.unstakingPeriod') }}
        </div>

        <Loading v-if="isLoading" :width="28" />

        <div v-else class="value" data-testid="unstakingPeriodValue">{{ period }}</div>
      </div>
    </div>
  </ContentForm>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { NetworkParams } from '@/stores';
import { Components } from '@/router/routes';
import { getCostOfAssets } from '@/helpers/transfers';
import { getUtilityAsset } from '@/helpers/currencies';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

const props = defineProps<{
  stakingNetwork: NetworkParams;
}>();

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const router = useRouter();
const { n, t } = useI18n();

const network = computed(() => props.stakingNetwork.network);
const icon = computed(() => props.stakingNetwork.icon);
const unbondPeriod = computed(() => props.stakingNetwork.unbondPeriod);
const unbondAmount = computed(() => props.stakingNetwork.unbond.sum);
const asset = computed(() => props.stakingNetwork.asset);
const isLoading = computed(() => props.stakingNetwork.loading);
const totalStake = computed(() => props.stakingNetwork.totalStake);

const apy = computed(() => `${n(props.stakingNetwork.apy, 'price')}%`);
const period = computed(() => `${unbondPeriod.value} ${t('common.days')}`);

const fiatValue = computed(() => {
  const stakingCurrency = getUtilityAsset(accountsStore.balances, network.value);
  const priceId = stakingCurrency?.priceId ?? '';
  const price = networksStore.getAssetPrice(priceId).price;
  const value = Number(getCostOfAssets(totalStake.value, price, 'string'));

  return n(value, 'price');
});

function openStakingInfo() {
  if (isLoading.value) return;

  router.push({
    name: Components.MyStake,
    params: {
      network: network.value.toLowerCase(),
      paramsLoaded: 'true',
    },
  });
}
</script>

<style lang="scss" scoped>
.my-staking-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 20px 0 0 15px;
  margin-right: 16px;
  user-select: none;
  cursor: pointer;

  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: $default-border;
    font-size: 0.875em;
    text-align: left;
    padding: 5px 0;
    min-height: 45px;
    width: 100%;
    color: $default-white;

    &:last-child {
      border-bottom: none;
    }

    .value {
      font-weight: 600;
      text-align: right;
      text-transform: uppercase;
      display: flex;
      flex-direction: row;
      align-items: center;
    }
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
    width: 100%;

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

        .stake-name {
          font-size: 0.75rem;
          font-weight: 700;
          text-align: left;
        }

        .network-name {
          font-size: 1.25rem;
          font-weight: 700;
          line-height: 25px;
          text-align: left;
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

      .fiat {
        font-weight: 700;
      }
    }

    .description-part {
      display: flex;
      align-items: center;
    }
  }
}
</style>
