<template>
  <PortfolioSheet :title="t('portfolioDashboard.sync.title')" testid="portfolioSyncSheet" @close="$emit('close')">
    <p class="status" :class="`status--${state.kind}`" data-testid="syncStatus">
      <span class="status-dot" aria-hidden="true"></span>
      <strong>{{ stateLabel }}</strong>
    </p>

    <p class="explain" data-testid="syncExplain">{{ explanation }}</p>

    <section v-if="state.staleNetworks.length" class="block" aria-labelledby="sync-networks">
      <h3 id="sync-networks" class="block-title">{{ t('portfolioDashboard.sync.networks') }}</h3>
      <ul class="block-list" data-testid="syncNetworks">
        <li v-for="network in state.staleNetworks" :key="network">{{ network }}</li>
      </ul>
    </section>

    <section v-if="state.savedWallets.length" class="block" aria-labelledby="sync-wallets">
      <h3 id="sync-wallets" class="block-title">{{ t('portfolioDashboard.sync.wallets') }}</h3>
      <ul class="block-list" data-testid="syncWallets">
        <li v-for="wallet in state.savedWallets" :key="wallet.address" class="wallet-age">
          <span>{{ wallet.name }}</span>
          <span class="age">{{ age(wallet.ageMs) }}</span>
        </li>
      </ul>
    </section>

    <button type="button" class="refresh" :disabled="refreshing" :aria-busy="refreshing" data-testid="syncRefresh" @click="$emit('refresh')">
      {{ refreshing ? t('portfolioDashboard.sync.refreshing') : t('portfolioDashboard.sync.refresh') }}
    </button>
  </PortfolioSheet>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SyncState } from '@/portfolio/dashboard/syncState';
import PortfolioSheet from '@/screens/portfolio/PortfolioSheet.vue';
import { formatSyncAge } from '@/portfolio/syncFreshness';
import { useI18n } from '@/locales/useI18n';

const props = defineProps<{ state: SyncState; refreshing: boolean }>();

defineEmits<{ (event: 'close'): void; (event: 'refresh'): void }>();

const { t } = useI18n();

const stateLabel = computed(() => t(`portfolioDashboard.sync.${props.state.kind}`));
const explanation = computed(() => t(`portfolioDashboard.sync.${props.state.kind}Text`));
const age = (ageMs: number): string => formatSyncAge(Date.now() - ageMs, Date.now(), (key, values) => t(key, values ?? {}));
</script>

<style lang="scss" scoped>
.status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-family: var(--fw-font-mono, 'JetBrains Mono', monospace);
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--fw-text-3);
}

.status--live .status-dot {
  background: var(--fw-success);
}

.status--saved .status-dot,
.status--partial .status-dot {
  background: var(--fw-warning);
}

.status--offline .status-dot {
  background: var(--fw-text-3);
}

.explain {
  margin: 0;
  color: var(--fw-text-2);
}

.block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 10px;
  border-top: 1px solid var(--fw-divider);
}

.block-title {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--fw-text-3);
}

.block-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.wallet-age {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.age {
  color: var(--fw-text-2);
  white-space: nowrap;
}

.refresh {
  align-self: flex-start;
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid var(--fw-accent-edge);
  border-radius: 10px;
  background: linear-gradient(180deg, var(--fw-fill-top), var(--fw-fill-bottom));
  color: var(--fw-on-accent);
  font: inherit;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: 2px;
  }
}
</style>
