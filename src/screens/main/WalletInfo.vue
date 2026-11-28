<template>
  <FCorners size="big">
    <div :class="contentClasses" data-testid="walletInfo">
      <button type="button" class="content" data-testid="content" :aria-label="name" :aria-pressed="isSelected" @click="$emit('setWallet')">
        <div class="name" data-testid="name">{{ name }}</div>

        <WalletBalance class="balance" :balance="balance" :changeWalletBalance="changeWalletBalance" :caption="balanceCaption" />
      </button>

      <Icon v-if="isMobile" icon="mobile" className="mobile" />

      <button v-if="showMenu" type="button" class="dots-container" :ref="dotsHorizontalRef" data-testid="dots" :aria-label="`${$t('ux.moreOptions')}: ${name}`" @click.stop="showWalletDetails">
        <Icon icon="dots-horizontal" className="dots" aria-hidden="true" />
      </button>
    </div>
  </FCorners>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import type { ResponseTotalBalances } from '@extension-base/background/types/types';
import WalletBalance from '@/screens/main/WalletBalance.vue';
import { fetchWalletTotals, walletBalanceCaption } from '@/screens/main/walletTotals';

type TotalsRow = { address: () => string; update: (totals: ResponseTotalBalances[]) => void };

// Each request builds every wallet's total in the background, so all mounted rows share one request
// every 5 s instead of sending one each.
const TOTALS_REFRESH_MS = 5000;
const totalsRows = new Set<TotalsRow>();
let totalsTimer: ReturnType<typeof setInterval> | undefined;
let totalsRequest: Promise<void> | undefined;
let totalsStale = false;

function refreshWalletTotals() {
  // A slow answer is not stacked with more requests.
  if (totalsRequest) return;
  const rows = [...totalsRows];
  const addresses = [...new Set(rows.map(({ address }) => address()))];
  totalsStale = false;
  totalsRequest = Promise.resolve()
    .then(() => fetchWalletTotals(addresses))
    .then((totals) => rows.forEach((row) => totalsRows.has(row) && row.update(totals)))
    // The rows keep their last totals until the next refresh.
    .catch(() => undefined)
    .finally(() => {
      totalsRequest = undefined;
      // Rows that opened meanwhile also need their hidden assets counted.
      if (totalsStale && totalsRows.size) refreshWalletTotals();
    });
}

function watchWalletTotals(row: TotalsRow): () => void {
  totalsRows.add(row);
  totalsTimer ??= setInterval(refreshWalletTotals, TOTALS_REFRESH_MS);
  if (totalsRequest) totalsStale = true;
  else refreshWalletTotals();

  return () => {
    totalsRows.delete(row);
    if (totalsRows.size) return;
    clearInterval(totalsTimer);
    totalsTimer = undefined;
  };
}

export default defineComponent({ name: 'WalletInfo',
  components: { WalletBalance },
  props: {
    name: { default: '' },
    address: { default: '' },
    isMobile: Boolean,
    isSelected: { default: false },
    showMenu: { default: true },
  },
  data() {
    return {
      dotsHorizontalRef: 'dotsHorizontal',
      showWalletMenu: false,
      totalBalances: [] as ResponseTotalBalances[],
      stopTotals: undefined as (() => void) | undefined,
    };
  },
  computed: {
    totalBalance() {
      return this.totalBalances.find(({ address }) => address === this.address);
    },
    balance() {
      return this.totalBalance?.total ?? 0;
    },
    changeWalletBalance() {
      return this.totalBalance?.change ?? { percent: 0, amount: 0 };
    },
    balanceCaption(): string {
      return walletBalanceCaption(this.totalBalance, (key) => this.$t(key));
    },
    contentClasses() {
      return [
            'wallet-info',
            {
              'is-selected': this.isSelected,
            },
          ];
    },
  },
  created() {
    this.stopTotals = watchWalletTotals({ address: () => this.address, update: (totals) => (this.totalBalances = totals) });
  },
  beforeUnmount() {
    this.stopTotals?.();
  },
  methods: {
    showWalletDetails() {
      const buttonTop = (this.$refs[this.dotsHorizontalRef] as HTMLButtonElement).getBoundingClientRect().top;
      this.$emit('setShowWalletDetailsPopupVisible', buttonTop);
    },
  },
});
</script>

<style lang="scss" scoped>
.wallet-info {
  display: flex;
  gap: 8px;
  align-items: center;
  text-align: left;
  opacity: 0.9;
  border: $default-border;
  padding: 10px $default-padding;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border: $default-border;
  border-radius: $default-border-radius;
  background: $secondary-background-color;
  user-select: none;
  cursor: pointer;

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
    &:focus-visible { outline: 2px solid palette($pink-lavender-color, var(--fw-focus)); outline-offset: 2px; }
  }

  .content {
    min-width: 0;
    min-height: 45px; // TODO: delete after adding percent
    flex-grow: 1;
  }

  .name {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    color: $gray-color;
    margin-bottom: 4px;
    max-width: 185px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile {
    width: 18px;
    height: 18px;
  }

  .s-icon-basic-check-mark-24 {
    color: $pink-lavender-color;
  }

  .dots-container {
    min-height: 44px;
    min-width: 44px;
    opacity: 0.9;
    display: flex;

    &:hover {
      opacity: 1;
    }

    .dots {
      margin: auto;
      height: 20px;
      width: 20px;
    }
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
