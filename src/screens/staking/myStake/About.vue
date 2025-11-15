<template>
  <div>
    <ContentForm :height="210" :isStaticHeight="true" :bottomRightCorner="true" class="about-form">
      <div class="about-stake">
        <div class="one block">
          <div class="label" data-testid="labelOne">{{ $t('staking.stakingActiveBalance') }}</div>
          <div class="amount-info" data-testid="amountOne">
            <div class="amount">{{ activeStake }}</div>
            <div>{{ stakingAssetName }}</div>
          </div>
          <div class="value" data-testid="valueOne">{{ accountsStore.fiatSymbol }}{{ activeStakeValue }}</div>
        </div>

        <div class="two block">
          <div class="label" data-testid="labelTwo">{{ $t('staking.rewarded') }}</div>

          <Loading v-if="isLoading" class="loading" />

          <div v-else class="amount-info" data-testid="amountTwo">
            <div class="amount">{{ $n(rewardAmount, 'decimal') }}</div>
            <div>{{ rewardedAsset }}</div>
          </div>

          <div class="value" data-testid="valueTwo">{{ accountsStore.fiatSymbol }}{{ rewardedValue }}</div>
        </div>

        <div class="three block">
          <div class="label" data-testid="labelThree">{{ $t('staking.unstaking') }}</div>
          <div class="amount-info" data-testid="amountThree">
            <div class="amount">{{ unbondAmount }}</div>
            <div>{{ stakingAssetName }}</div>

            <template v-if="showUnbondDetails">
              <Icon icon="info" class="info-unbond" />

              <Tooltip :text="unbondDetails" target=".info-unbond" />
            </template>
          </div>
          <div class="value" data-testid="valueThree">{{ accountsStore.fiatSymbol }}{{ unbondValue }}</div>
        </div>

        <div class="four block">
          <div class="label" data-testid="labelFour">{{ $t('staking.redeemable') }}</div>
          <div class="amount-info" data-testid="amountFour">
            <div class="amount">{{ redeemAmount }}</div>
            <div>{{ stakingAssetName }}</div>
          </div>
          <div class="value" data-testid="valueFour">{{ accountsStore.fiatSymbol }}{{ redeemableValue }}</div>
        </div>
      </div>
    </ContentForm>

    <div class="analytics-grid">
      <ContentForm :height="220" :isStaticHeight="true" :bottomRightCorner="true" class="analytics-card apy-card">
        <div class="analytics-card__header">
          <div>
            <div class="meta-label">{{ $t('staking.performance') }}</div>
            <div class="metric-value">{{ latestApy }}% {{ $t('staking.apy') }}</div>
          </div>

          <div class="delta" :class="deltaClass">
            <span class="delta-indicator"></span>
            <span>{{ apyChangeText }}</span>
          </div>
        </div>

        <Sparkline class="analytics-card__sparkline" :points="apyTrend" />

        <div class="analytics-card__footer">
          <span>{{ $t('staking.apyHistory') }}</span>
          <span v-if="lastUpdated">{{ $t('staking.lastUpdated') }} {{ lastUpdated }}</span>
          <span class="helper-tag">{{ $t('staking.sampledLocally') }}</span>
        </div>
      </ContentForm>

      <ContentForm :height="220" :isStaticHeight="true" :bottomRightCorner="true" class="analytics-card validator-card">
        <div class="analytics-card__header">
          <div>
            <div class="meta-label">{{ $t('staking.validatorBreakdown') }}</div>
            <div class="analytics-card__subtitle">
              {{ $t('staking.totalValidators', { count: validatorTotals.total }) }}
            </div>
          </div>
        </div>

        <div class="validator-stats">
          <div v-for="stat in validatorStatList" :key="stat.key" class="validator-stats__item">
            <span class="label">{{ $t(stat.label) }}</span>
            <span class="value">{{ stat.value }}</span>
          </div>
        </div>

        <div class="top-validators">
          <div class="top-validators__header">{{ $t('staking.topValidators') }}</div>

          <div v-if="topValidators.length" class="top-validators__list">
            <div v-for="validator in topValidators" :key="validator.address" class="top-validators__row">
              <div class="top-validators__identity">
                <div class="name">{{ validator.name }}</div>
                <div class="address">{{ validator.shortAddress }}</div>
              </div>

              <div class="top-validators__meta">
                <span>{{ validator.apyValue }}% {{ $t('staking.apy') }}</span>
                <span>{{ $t('staking.validatorCommission') }}: {{ validator.commissionValue }}%</span>
                <span class="status-pill" :class="`status-${validator.statusKey}`">
                  {{ $t(`staking.${validator.statusKey}`) }}
                </span>
              </div>
            </div>
          </div>

          <div v-else class="top-validators__empty">{{ $t('common.nothingFound') }}</div>
        </div>
      </ContentForm>
    </div>

    <div class="about-label" data-testid="aboutLabel">
      {{ $t('common.about') }}
    </div>

    <div class="descriptions" data-testid="descriptions">
      {{ aboutDescription }}
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { HistoryElement } from '@/interfaces';
import { useStakingStore } from '@/stores/staking';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { getHistoryValue } from '@/helpers/history';
import { cut } from '@/helpers';
import BaseApi from '@/util/BaseApi';
import { normalizeNetworkName } from '@/helpers/networkGroups';
import Sparkline from '@/components/charts/Sparkline.vue';

const props = defineProps<{
  stakingCurrency: TokenGroup;
  rewardedCurrency: TokenGroup;
  network: string;
}>();

const stakingStore = useStakingStore();
const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const { t, n } = useI18n();

const isLoading = ref(false);

const stakingNetwork = computed(() => stakingStore.getStakingNetwork(props.network));
const insightsFallback = {
  apyTrend: [],
  dayChange: 0,
  validatorStats: { active: 0, inactive: 0, waiting: 0, oversubscribed: 0 },
};
const stakingInsights = computed(() => stakingNetwork.value.insights ?? insightsFallback);
const apyTrend = computed(() => stakingInsights.value.apyTrend);
const latestApy = computed(() => n(Number(stakingNetwork.value.apy ?? 0), 'price'));
const apyChange = computed(() => stakingInsights.value.dayChange);
const apyChangeText = computed(() => {
  const formatted = n(Math.abs(apyChange.value), 'price');
  const prefix = apyChange.value >= 0 ? '+' : '-';

  return `${prefix}${formatted}%`;
});
const deltaClass = computed(() => (apyChange.value >= 0 ? 'positive' : 'negative'));
const lastUpdated = computed(() => {
  const latestPoint = apyTrend.value[apyTrend.value.length - 1];

  if (!latestPoint) return '';

  return new Date(latestPoint.timestamp).toLocaleString();
});
const validatorStats = computed(() => stakingInsights.value.validatorStats);
const validatorStatList = computed(() => [
  { key: 'active', label: 'staking.active', value: validatorStats.value.active },
  { key: 'waiting', label: 'staking.waiting', value: validatorStats.value.waiting },
  { key: 'inactive', label: 'staking.inactive', value: validatorStats.value.inactive },
  { key: 'oversubscribed', label: 'staking.oversubscribed', value: validatorStats.value.oversubscribed },
]);
const validatorTotals = computed(() => ({
  total:
    validatorStats.value.active +
    validatorStats.value.waiting +
    validatorStats.value.inactive +
    validatorStats.value.oversubscribed,
}));
const topValidators = computed(() => {
  const validators = stakingNetwork.value.validators ?? [];

  return [...validators]
    .sort((validatorA, validatorB) => Number(validatorB.apy ?? 0) - Number(validatorA.apy ?? 0))
    .slice(0, 3)
    .map((validator) => {
      const normalizedStatus = (validator.status ?? '').trim();
      const statusKey =
        normalizedStatus || (validator.isActive ? 'active' : validator.isWaiting ? 'waiting' : 'inactive');

      return {
        ...validator,
        apyValue: n(Number(validator.apy ?? 0), 'price'),
        commissionValue:
          typeof validator.commission === 'string' ? validator.commission : (validator.commission?.toString() ?? '0'),
        statusKey,
        shortAddress: cut(validator.address ?? '', 5),
      };
    });
});

const historyResult = computed(() =>
  stakingStore.getStakingHistory(
    props.network,
    props.stakingCurrency.groupId,
    stakingNetwork.value.stashAddress,
    stakingNetwork.value.payeeAddress
  )
);
const historyEntries = computed<HistoryElement[]>(() => (historyResult.value.entries ?? []) as HistoryElement[]);
const normalizedNetworkName = computed(() => normalizeNetworkName(props.network));
const aboutDescription = computed(() => {
  const specificKey = `staking.about.${normalizedNetworkName.value}`;
  const specificTranslation = t(specificKey);

  if (specificTranslation !== specificKey) return specificTranslation;

  const fallbackKey = 'staking.about.generic';
  const fallbackTranslation = t(fallbackKey);

  return fallbackTranslation === fallbackKey ? '' : fallbackTranslation;
});

const formattedAddress = computed(() => {
  if (BaseApi.isEthereumNetwork(props.network.toLowerCase())) {
    return accountsStore.selectedWallet.ethereumAddress;
  }

  const network = networksStore.getNetwork(props.network);

  return BaseApi.encodeAddress(accountsStore.selectedWallet.address, network.addressPrefix);
});

const activeStake = computed(() => n(+stakingNetwork.value.activeStake, 'decimal'));

const rewardAssetId = computed(
  () =>
    (normalizedNetworkName.value === 'sora' ? props.rewardedCurrency.groupId : undefined) ??
    props.stakingCurrency.groupId
);
const rewardAmount = computed(() =>
  historyEntries.value
    .filter((entry) => entry.method === 'rewarded' || entry.reward !== undefined)
    .reduce((result, entry) => {
      const { value } = getHistoryValue(entry, rewardAssetId.value, props.network, formattedAddress.value, true);

      return value > 0 ? result + value : result;
    }, 0)
);

const showUnbondDetails = computed(() => stakingNetwork.value.unbond.unlocking.length !== 0);

const unbondAmount = computed(() => n(+stakingNetwork.value.unbond.sum, 'decimal'));
const redeemAmount = computed(() => n(+stakingNetwork.value.redeemAmount, 'decimal'));

const stakingAssetName = computed(() => props.stakingCurrency?.symbol ?? '');
const rewardedAsset = computed(() => props.rewardedCurrency?.symbol ?? props.stakingCurrency?.symbol ?? '');

const stakingAssetPrice = computed(() => networksStore.getAssetPrice(props.stakingCurrency?.priceId ?? '').price);

const rewardedAssetPrice = computed(() => networksStore.getAssetPrice(props.rewardedCurrency?.priceId ?? '').price);

const activeStakeValue = computed(() => {
  const value = +stakingNetwork.value.activeStake * stakingAssetPrice.value;

  return n(value, 'price');
});

const rewardedValue = computed(() => {
  const price = rewardedAssetPrice.value || stakingAssetPrice.value;
  const value = rewardAmount.value * price;

  return n(value, 'price');
});

const unbondValue = computed(() => {
  const value = +stakingNetwork.value.unbond.sum * stakingAssetPrice.value;

  return n(value, 'price');
});

const redeemableValue = computed(() => {
  const value = +stakingNetwork.value.redeemAmount * stakingAssetPrice.value;

  return n(value, 'price');
});

const unbondDetails = computed(() => {
  const unbond = stakingNetwork.value.unbond;
  const asset = stakingNetwork.value.asset.toUpperCase();
  const base = `${t('staking.unbond')} ${unbond.sum} ${asset}:`;

  return unbond.unlocking.reduce(
    (result, { value, remainingDays }) =>
      `${result}<p>- ${value} ${asset} ${remainingDays} ${t('staking.daysLeft')}</p>`,
    base
  );
});
</script>

<style lang="scss" scoped>
.about-label {
  font-weight: 600;
  color: $default-white;
  margin: 15px 0;
  text-align: left;
}

.descriptions {
  font-size: 0.875em;
  color: $default-white;
  text-align: left;
  line-height: 20px;
}

.about-form {
  margin-top: 10px;

  .about-stake {
    display: grid;
    grid-auto-columns: 247px;
    grid-auto-rows: 105px;
    text-transform: uppercase;

    .block {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: center;
      text-align: left;
      padding-left: 35px;
    }

    .label {
      font-size: 0.75rem;
      font-weight: 600;
      text-align: left;
      color: $grayish-white;
      margin-bottom: 5px;
    }

    .amount-info {
      display: flex;
      align-items: center;
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 5px;
      height: 23px;

      .amount {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 125px;
        margin-right: 5px;
      }
    }

    .value {
      font-size: 0.875em;
      color: $grayish-white;
    }

    .one {
      grid-column: 1;
      grid-row: 1;
      border-right: $default-border;
      border-bottom: $default-border;
    }

    .two {
      grid-column: 2;
      grid-row: 1;
      border-bottom: $default-border;
    }

    .three {
      grid-column: 1;
      grid-row: 2;
      border-right: $default-border;
    }

    .four {
      grid-column: 2;
      grid-row: 2;
    }

    .info-unbond {
      height: 18px;
      width: 18px;
      margin-left: 10px;
    }

    .loading {
      height: 23px;
      margin-bottom: 5px;
    }
  }
}

.analytics-grid {
  margin: 20px 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}

.analytics-card {
  padding: 0;
  text-align: left;
  color: $default-white;

  &__header {
    display: flex;
    justify-content: space-between;
    padding: 16px 16px 0;
    gap: 8px;
  }

  .meta-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: $grayish-white;
    text-transform: uppercase;
  }

  .metric-value {
    font-size: 1.5rem;
    font-weight: 700;
    margin-top: 4px;
  }

  &__sparkline {
    padding: 0 16px;
  }

  &__footer {
    padding: 8px 16px 16px;
    display: flex;
    flex-direction: column;
    font-size: 0.75rem;
    color: $grayish-white;
    gap: 4px;
  }

  &__subtitle {
    font-size: 0.875rem;
    color: $grayish-white;
    margin-top: 4px;
  }
}

.apy-card :deep(.sparkline) {
  --sparkline-accent: #66b4ff;
}

.helper-tag {
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.delta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;

  &-indicator {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
  }

  &.positive {
    color: $success-color;

    .delta-indicator {
      background: $success-color;
    }
  }

  &.negative {
    color: $reject-color;

    .delta-indicator {
      background: $reject-color;
    }
  }
}

.validator-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 12px 16px 0;

  &__item {
    display: flex;
    flex-direction: column;
    background: rgba($default-white, 0.04);
    padding: 12px;
    border-radius: 12px;

    .label {
      font-size: 0.75rem;
      color: $grayish-white;
      text-transform: uppercase;
    }

    .value {
      font-size: 1.25rem;
      font-weight: 700;
    }
  }
}

.top-validators {
  padding: 10px 16px 16px;

  &__header {
    font-size: 0.875rem;
    font-weight: 600;
    margin-bottom: 8px;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  &__row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    border-bottom: $default-border;
    padding-bottom: 10px;

    &:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }
  }

  &__identity {
    .name {
      font-weight: 600;
    }

    .address {
      font-size: 0.75rem;
      color: $grayish-white;
    }
  }

  &__meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    font-size: 0.75rem;
    color: $grayish-white;
    gap: 4px;
  }

  &__empty {
    font-size: 0.875rem;
    color: $grayish-white;
  }
}

.status-pill {
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border: 1px solid currentColor;

  &.status-active {
    color: $success-color;
  }

  &.status-waiting {
    color: $orange-color;
  }

  &.status-inactive {
    color: $grayish-white;
  }

  &.status-oversubscribed {
    color: $pink-lavender-color;
  }
}

.fw-web {
  .about-form {
    .about-stake {
      grid-auto-columns: auto !important;
    }
  }
}
</style>
