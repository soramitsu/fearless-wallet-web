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
import { FPNumber } from '@sora-substrate/util';
import type { ResponseTotalBalances } from '@extension-base/background/types/types';
import WalletBalance from '@/screens/main/WalletBalance.vue';
import { getTotalBalances } from '@/extension/messaging';
import { hiddenKeysForWallet } from '@/portfolio/usePortfolioPreferences';
import { useAccountsStore } from '@/stores/accounts';
import { useNetworksStore } from '@/stores/networks';

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
      interval: undefined as ReturnType<typeof setInterval> | undefined,
      accountsStore: useAccountsStore(),
      networksStore: useNetworksStore(),
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
    // The wallet list shows the full balance; when part of it is hidden in the portfolio, it says so.
    balanceCaption(): string {
      const hiddenValue = this.totalBalance?.hiddenValue;
      return hiddenValue && new FPNumber(hiddenValue).isGtZero() ? this.$t('portfolioPage.inclHidden') : '';
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
  async created() {
    this.totalBalances = await this.fetchTotalBalances();

        this.interval = setInterval(async () => (this.totalBalances = await this.fetchTotalBalances()), 5000);
  },
  beforeUnmount() {
    clearInterval(this.interval);
  },
  methods: {
    fetchTotalBalances(): Promise<ResponseTotalBalances[]> {
      let hiddenKeys: string[] = [];

      try {
        hiddenKeys = hiddenKeysForWallet(
          this.address,
          this.accountsStore.assetPreferencesForAllAccounts[this.address] ?? {},
          this.networksStore.allNetworks
        );
      } catch {
        // Without hidden keys the full total still shows; only the "incl. hidden" label is missing.
      }

      return getTotalBalances(hiddenKeys.length ? { hiddenKeysByAddress: { [this.address]: hiddenKeys } } : null);
    },
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
    &:focus-visible { outline: 2px solid $pink-lavender-color; outline-offset: 2px; }
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
