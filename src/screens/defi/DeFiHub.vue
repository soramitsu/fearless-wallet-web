<template>
  <div class="defi-hub">
    <header class="workspace-header">
      <div>
        <h1>{{ t('defiHub.title') }}</h1>
        <p>{{ t('defiHub.subtitle') }}</p>
      </div>
      <span class="network-context">{{ t('defiHub.multiNetwork') }}</span>
    </header>

    <ContentForm :height="contentHeight">
      <Scroll>
        <section class="hub-section positions">
          <span class="eyebrow">{{ t('defiHub.yourPositions') }}</span>
          <div role="status" aria-live="polite">
            <p v-if="loading">{{ t('ux.loadingPositions') }}</p>
            <p v-else-if="dashboard.status === 'unavailable'">{{ t('ux.positionsUnavailable') }}</p>
            <p v-else-if="dashboard.status === 'partial'">{{ t('ux.incompletePositions') }}</p>
            <p v-else-if="!dashboard.rows.length">{{ t('ux.positionsEmpty') }}</p>
            <p v-if="dashboard.rows.length">{{ t('ux.knownPositions', { count: dashboard.rows.length }) }}</p>
          </div>
          <button type="button" class="refresh-positions" :disabled="loading" @click="loadPositions">
            {{ t(dashboard.status === 'ready' ? 'ux.refresh' : 'ux.retry') }}
          </button>
          <button
            v-for="position in dashboard.rows"
            :key="position.id"
            type="button"
            class="position-row"
            @click="router.push(position.route)"
          >
            <span class="position-heading"
              ><strong>{{ position.title }}</strong
              ><small>{{ position.network }}</small></span
            >
            <span v-for="(value, index) in position.values" :key="index" class="position-value"
              ><span>{{ t(value.label) }}</span
              ><strong>{{ value.value }}</strong></span
            >
            <span class="position-action">{{ t('ux.managePosition') }} →</span>
          </button>
        </section>

        <section class="hub-section">
          <h2>{{ t('defiHub.earn') }}</h2>
          <button class="hub-row" type="button" @click="open(Components.Staking)">
            <Icon icon="staking" className="hub-icon" :hover="false" />
            <span
              ><strong>{{ t('defiHub.staking') }}</strong
              ><small>{{ t('defiHub.stakingDescription') }}</small></span
            >
            <span class="capability">{{ stakingCapability }}</span>
            <Icon icon="chevron-right" :hover="false" />
          </button>
          <button class="hub-row" type="button" @click="open(Components.Pools)">
            <Icon icon="pools" className="hub-icon" :hover="false" />
            <span
              ><strong>{{ t('defiHub.liquidityPools') }}</strong
              ><small>{{ t('defiHub.liquidityDescription') }}</small></span
            >
            <span class="capability">SORA</span>
            <Icon icon="chevron-right" :hover="false" />
          </button>
          <button class="hub-row" type="button" @click="open(Components.Farming)">
            <Icon icon="stake" className="hub-icon" :hover="false" />
            <span
              ><strong>{{ t('defiHub.farming') }}</strong
              ><small>{{ t('defiHub.farmingDescription') }}</small></span
            >
            <span class="capability">SORA</span>
            <Icon icon="chevron-right" :hover="false" />
          </button>
        </section>

        <section class="hub-section">
          <h2>{{ t('defiHub.markets') }}</h2>
          <button class="hub-row" type="button" @click="open(Components.Polkamarkt)">
            <Icon icon="controller" className="hub-icon" :hover="false" />
            <span
              ><strong>Polkamarkt</strong><small>{{ t('defiHub.polkamarktDescription') }}</small></span
            >
            <span class="capability">{{ t('defiHub.soraXorFees') }}</span>
            <Icon icon="chevron-right" :hover="false" />
          </button>
        </section>
      </Scroll>
    </ContentForm>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Components } from '@/router/routes';
import { CONTENT_FORM_HEIGHT } from '@/consts/global';
import { useStakingStore } from '@/stores/staking';
import { usePoolsStore } from '@/stores/pools';
import { useAccountsStore } from '@/stores/accounts';
import { getDemeterPools, getPoolsParams } from '@/extension/messaging/pools';
import { getStakingParams } from '@/extension/messaging/staking';
import { SORA_NETWORK_NAME } from '@/consts/sora';
import { getPolkamarktSnapshot } from '@/extension/messaging/polkamarkt';
import { loadPositionDashboard, type PositionDashboard } from '@/defi/positionDashboard';
import { useI18n } from '@/locales/useI18n';

const router = useRouter();
const { t } = useI18n();
const accountsStore = useAccountsStore();
const stakingStore = useStakingStore();
const poolsStore = usePoolsStore();
const contentHeight = CONTENT_FORM_HEIGHT;
const dashboard = ref<PositionDashboard>({ rows: [], status: 'ready' });
const loading = ref(true);
let requestId = 0;
let loadedWallet = '';
const stakingCapability = computed(() =>
  accountsStore.selectedWallet.isSubstrate ? t('defiHub.availableNetworks') : t('defiHub.addSubstrateAccount')
);
const open = (name: Components) => router.push({ name });

async function loadPositions() {
  const id = ++requestId;
  const wallet = accountsStore.selectedWallet.address;
  if (wallet !== loadedWallet) {
    dashboard.value = { rows: [], status: 'ready' };
    loadedWallet = wallet;
  }
  loading.value = true;
  let result: PositionDashboard;
  try {
    result = await loadPositionDashboard({
      staking: async () => {
        const positions = await getStakingParams({ networks: [SORA_NETWORK_NAME] });
        if (id === requestId) stakingStore.updateStakingParams(positions);
        return positions;
      },
      pools: async () => {
        const positions = await getPoolsParams({ networks: [SORA_NETWORK_NAME] });
        if (id === requestId) poolsStore.updatePoolsParams(positions);
        return positions;
      },
      stakingSymbol: () => 'XOR',
      farming: getDemeterPools,
      markets: getPolkamarktSnapshot,
    });
  } catch {
    result = { rows: [], status: 'unavailable' };
  }
  if (id !== requestId || wallet !== accountsStore.selectedWallet.address) return;
  dashboard.value = result;
  loading.value = false;
}
watch(
  () => accountsStore.selectedWallet.address,
  () => {
    void loadPositions();
  },
  { immediate: true }
);
onActivated(() => {
  if (!loading.value) void loadPositions();
});
onBeforeUnmount(() => {
  requestId++;
});
</script>

<style lang="scss" scoped>
.defi-hub {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.workspace-header {
  min-height: 56px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 8px;
  text-align: left;

  h1 {
    margin: 0;
    font-size: 1.35rem;
  }

  p {
    margin: 4px 0 0;
    color: $gray-color;
    font-size: 0.875rem;
  }
}

.network-context,
.capability {
  color: $gray-color;
  font-size: 0.8125rem;
}

.hub-section {
  padding: 18px 16px 4px;
  text-align: left;

  + .hub-section {
    border-top: $default-border;
  }

  h2,
  .eyebrow {
    margin: 0 0 8px;
    color: $gray-color;
    font-size: 0.8125rem;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }
}

.position-summary {
  display: flex;
  align-items: baseline;
  gap: 7px;

  strong {
    font-size: 1.65rem;
  }
}

.positions p {
  color: $gray-color;
  font-size: 0.875rem;
}

.hub-row {
  min-height: 66px;
  width: 100%;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto 16px;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border: 0;
  border-top: $default-border;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;

  span:nth-child(2) {
    display: flex;
    min-width: 0;
    flex-direction: column;
  }

  small {
    margin-top: 4px;
    color: $gray-color;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: normal;
  }
}

.hub-icon {
  width: 24px;
  height: 24px;
  color: $pink-lavender-color;
}
</style>

<style lang="scss" scoped>
.position-row {
  display: grid;
  width: 100%;
  gap: 10px;
  padding: 18px 0;
  text-align: left;
  border: 0;
  border-top: $default-border;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.position-heading {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}
.position-heading small,
.position-value > span {
  color: $default-white;
  font-size: 0.875rem;
}
.position-value {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
}
.position-value strong {
  overflow-wrap: anywhere;
  font-size: 0.875rem;
}
.position-action {
  color: $pink-lavender-color;
  font-size: 0.875rem;
}
.refresh-positions {
  color: $plain-white;
  background: $secondary-btn-color;
  border: $default-border;
  border-radius: 8px;
  font: inherit;
  padding: 10px 16px;
  margin-bottom: 16px;
  cursor: pointer;
}
.refresh-positions:disabled {
  opacity: 0.5;
}
</style>
