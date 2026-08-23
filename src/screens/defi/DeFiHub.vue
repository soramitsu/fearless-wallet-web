<template>
  <div class="defi-hub">
    <header class="workspace-header">
      <div>
        <h1>DeFi</h1>
        <p>Positions and opportunities, with the network and collateral made explicit.</p>
      </div>
      <span class="network-context">Multi-network</span>
    </header>

    <ContentForm :height="contentHeight">
      <Scroll>
        <section class="hub-section positions">
          <span class="eyebrow">Your positions</span>
          <div class="position-summary">
            <strong>{{ positionCount }}</strong>
            <span>{{ positionCount === 1 ? 'active position' : 'active positions' }}</span>
          </div>
          <p v-if="positionStatus === 'partial'">Some SORA positions could not be refreshed and may be stale.</p>
          <p v-else-if="positionStatus === 'unavailable'">SORA farming and market positions are currently unavailable.</p>
          <p v-if="positionCount === 0">Staking, liquidity, farming, and market positions will appear here.</p>
        </section>

        <section class="hub-section">
          <h2>Earn</h2>
          <button class="hub-row" type="button" @click="open(Components.Staking)">
            <Icon icon="staking" className="hub-icon" :hover="false" />
            <span><strong>Staking</strong><small>Native staking and nomination pools</small></span>
            <span class="capability">{{ stakingCapability }}</span>
            <Icon icon="chevron-right" :hover="false" />
          </button>
          <button class="hub-row" type="button" @click="open(Components.Pools)">
            <Icon icon="pools" className="hub-icon" :hover="false" />
            <span><strong>Liquidity pools</strong><small>SORA Polkaswap LP positions</small></span>
            <span class="capability">SORA</span>
            <Icon icon="chevron-right" :hover="false" />
          </button>
          <button class="hub-row" type="button" @click="open(Components.Farming)">
            <Icon icon="stake" className="hub-icon" :hover="false" />
            <span><strong>Farming</strong><small>Demeter pools, rewards, and claims</small></span>
            <span class="capability">SORA</span>
            <Icon icon="chevron-right" :hover="false" />
          </button>
        </section>

        <section class="hub-section">
          <h2>Markets</h2>
          <button class="hub-row" type="button" @click="open(Components.Polkamarkt)">
            <Icon icon="controller" className="hub-icon" :hover="false" />
            <span><strong>Polkamarkt</strong><small>Prediction markets collateralized in KUSD</small></span>
            <span class="capability">SORA · XOR fees</span>
            <Icon icon="chevron-right" :hover="false" />
          </button>
        </section>
      </Scroll>
    </ContentForm>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Components } from '@/router/routes';
import { CONTENT_FORM_HEIGHT } from '@/consts/global';
import { useStakingStore } from '@/stores/staking';
import { usePoolsStore } from '@/stores/pools';
import { useAccountsStore } from '@/stores/accounts';
import { getDemeterPools } from '@/extension/messaging/pools';
import { getPolkamarktSnapshot } from '@/extension/messaging/polkamarkt';
import {
  loadSupplementalPositionSummary,
  type SupplementalPositionStatus,
} from '@/defi/positionSummary';

const router = useRouter();
const accountsStore = useAccountsStore();
const stakingStore = useStakingStore();
const poolsStore = usePoolsStore();
const contentHeight = CONTENT_FORM_HEIGHT;
const supplementalPositionCount = ref(0);
const positionStatus = ref<SupplementalPositionStatus>('ready');
const positionCount = computed(
  () => stakingStore.myStakingItems.length + poolsStore.myPoolsItems.length + supplementalPositionCount.value
);
const stakingCapability = computed(() =>
  accountsStore.selectedWallet.isSubstrate ? 'Available networks' : 'Add a Substrate account'
);
const open = (name: Components) => router.push({ name });

onMounted(async () => {
  const summary = await loadSupplementalPositionSummary({
    loadDemeter: getDemeterPools,
    loadPolkamarkt: () => getPolkamarktSnapshot(),
  });

  supplementalPositionCount.value = summary.count;
  positionStatus.value = summary.status;
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
    font-size: 0.72rem;
  }
}

.network-context,
.capability {
  color: $gray-color;
  font-size: 0.68rem;
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
    font-size: 0.68rem;
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
  font-size: 0.72rem;
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
    white-space: nowrap;
  }
}

.hub-icon {
  width: 24px;
  height: 24px;
  color: $pink-lavender-color;
}
</style>
