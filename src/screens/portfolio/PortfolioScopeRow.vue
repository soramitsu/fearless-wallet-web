<template>
  <FCorners size="big">
    <div class="scope-row" :class="{ 'is-selected': selected }" data-testid="allWalletsRow">
      <button type="button" class="content" :aria-pressed="selected" :aria-label="label" @click="$emit('select')">
        <div class="name">{{ t('portfolioDashboard.allWallets') }}</div>

        <WalletBalance
          class="balance"
          :balance="aggregate.total"
          :changeWalletBalance="{ percent: aggregate.changePercent, amount: aggregate.changeAmount }"
          :caption="caption"
          :loading="pending"
          :loadingLabel="t('portfolioDashboard.rows.loading')"
        />
      </button>
    </div>
  </FCorners>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';
import WalletBalance from '@/screens/main/WalletBalance.vue';
import { aggregatePortfolios, type WalletPortfolio } from '@/portfolio/dashboard/aggregate';
import { hiddenKeysByAddress } from '@/portfolio/dashboard/hiddenKeys';
import { registerDashboardMessages } from '@/portfolio/dashboard/locales';
import { formatDecimalString } from '@/helpers/numbers';
import { useI18n } from '@/locales/useI18n';
import { useAccountsStore } from '@/stores/accounts';
import { useNetworksStore } from '@/stores/networks';
import { usePortfolioDashboardStore } from '@/stores/portfolioDashboard';

registerDashboardMessages();

defineProps<{ selected: boolean }>();

defineEmits<{ (event: 'select'): void }>();

const { t, tc } = useI18n();
const accountsStore = useAccountsStore();
const networksStore = useNetworksStore();
const store = usePortfolioDashboardStore();

// The wallet list asks for each wallet's total every few seconds while it is open; this row asks for all of them once.
const REFRESH_MS = 5000;
let timer: ReturnType<typeof setInterval> | undefined;
const refresh = () => store.refresh(hiddenKeysByAddress(accountsStore.accounts, accountsStore.assetPreferencesForAllAccounts, networksStore.allNetworks));

onMounted(() => {
  void refresh();
  timer = setInterval(refresh, REFRESH_MS);
});
onBeforeUnmount(() => clearInterval(timer));

const pending = computed(() => store.readAt === 0);
const wallets = computed<WalletPortfolio[]>(() => {
  const read = new Map(store.holdings.map((holding) => [holding.address, holding]));

  return accountsStore.accounts.flatMap(({ address, name }) => {
    const holding = read.get(address);

    return holding ? [{ ...holding, name }] : [];
  });
});
const aggregate = computed(() => aggregatePortfolios(wallets.value));
const caption = computed(() => tc('portfolioDashboard.walletsCount', accountsStore.accounts.length, { count: accountsStore.accounts.length }));
const label = computed(() =>
  pending.value
    ? t('portfolioDashboard.allWallets')
    : t('portfolioDashboard.scope.all', {
        total: `${accountsStore.fiatSymbol}${formatDecimalString(aggregate.value.total, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      })
);
</script>

<style lang="scss" scoped>
.scope-row {
  display: flex;
  gap: 8px;
  align-items: center;
  text-align: left;
  opacity: 0.9;
  padding: 10px $default-padding;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border: $default-border;
  border-radius: $default-border-radius;
  background: $secondary-background-color;
  user-select: none;

  &:hover {
    opacity: 1;
  }

  button {
    color: inherit;
    font: inherit;
    text-align: left;
    background: transparent;
    border: 0;
    padding: 0;
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid var(--fw-focus);
      outline-offset: 2px;
    }
  }

  .content {
    min-width: 0;
    min-height: 45px;
    flex-grow: 1;
  }

  .name {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    color: $gray-color;
    margin-bottom: 4px;
  }

  .balance {
    font-size: 1.125em;
    line-height: 22px;
  }
}

.is-selected {
  background: $pink-purple-color;
}
</style>
