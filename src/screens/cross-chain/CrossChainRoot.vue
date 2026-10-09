<template>
  <div class="cross-chain-root">
    <header class="workspace-header">
      <div>
        <h1>{{ t('crossChainPage.title') }}</h1>
        <p>{{ t('crossChainPage.subtitle') }}</p>
      </div>
    </header>

    <ContentForm :height="contentHeight">
      <Scroll>
        <div class="route-builder">
          <div v-if="!originNetworks.length" class="capability-state" role="status">
            <strong>{{ t('portfolioPage.noAssetsDetected') }}</strong>
            <FButton type="secondary" text="primaryMenu.portfolio" @click="router.push({ name: Components.Wallet })" />
          </div>
          <label>
            <span>{{ t('crossChainPage.originNetwork') }}</span>
            <select v-model="originChainId" :disabled="!originNetworks.length">
              <option value="">{{ t('crossChainPage.selectNetwork') }}</option>
              <option v-for="network in originNetworks" :key="network.chainId" :value="network.chainId">
                {{ network.name }} · {{ network.ecosystem }}
              </option>
            </select>
          </label>

          <div v-if="originChainId" class="route-account">
            <span>{{ t('crossChainPage.originAccount') }}</span>
            <strong>{{ accountsStore.selectedWallet.name || t('crossChainPage.selectedWallet') }}</strong>
            <small>{{ shortOriginAddress }}</small>
          </div>

          <label>
            <span>{{ t('crossChainPage.asset') }}</span>
            <select v-model="assetKey" :disabled="!originChainId">
              <option value="">{{ t('crossChainPage.selectAsset') }}</option>
              <option v-for="asset in originAssets" :key="asset.key" :value="asset.key">
                {{ asset.symbol }} · {{ asset.name }}
              </option>
            </select>
          </label>

          <div v-if="originChainId && selectedAsset && !reviewedRoutes.length" class="capability-state">
            <Icon icon="info" className="state-icon" :hover="false" />
            <strong>{{ t('crossChainPage.noReviewedRoute') }}</strong>
            <span>{{ unavailableMessage }}</span>
          </div>

          <label v-else-if="reviewedRoutes.length">
            <span>{{ t('crossChainPage.destinationNetwork') }}</span>
            <select v-model="routeId">
              <option value="">{{ t('crossChainPage.selectDestination') }}</option>
              <option v-for="route in reviewedRoutes" :key="route.id" :value="route.id">
                {{ route.destinationNetwork }} · {{ route.enabled ? route.protocol : t('crossChainPage.unavailable') }}
              </option>
            </select>
          </label>

          <div v-if="selectedRoute" class="route-summary">
            <span>{{ selectedRoute.originNetwork }} → {{ selectedRoute.destinationNetwork }}</span>
            <strong>{{ selectedRoute.protocol }}</strong>

            <dl class="route-facts">
              <div>
                <dt>{{ t('crossChainPage.minimum') }}</dt>
                <dd>{{ minimumLabel }}</dd>
              </div>
              <div>
                <dt>{{ t('crossChainPage.fees') }}</dt>
                <dd>{{ localizedFeeDescription }}</dd>
              </div>
              <div>
                <dt>{{ t('crossChainPage.estimatedTime') }}</dt>
                <dd>{{ localizedEstimatedTime }}</dd>
              </div>
            </dl>

            <small v-for="(warning, index) in localizedWarnings" :key="index">{{ warning }}</small>

            <span v-if="!selectedRoute.enabled" class="route-disabled">{{ localizedDisabledReason }}</span>
            <span v-else-if="!accountCapability.signable" class="route-disabled">{{ accountCapability.reason }}</span>
          </div>

          <FButton size="big" text="common.continue" :disabled="!canContinue" width="100%" @click="continueRoute" />

          <details class="provider-coverage" data-testid="crossChainProviderCoverage">
            <summary>{{ t('ux.supportedRoutes') }}</summary>
            <div class="provider-coverage__heading">
              <div>
                <span>{{ t('crossChainPage.providerCoverage') }}</span>
                <small>{{ t('crossChainPage.coverageIndependent') }}</small>
              </div>
              <strong>{{ providerCapabilities.length }}</strong>
            </div>

            <article
              v-for="provider in providerCapabilities"
              :key="provider.id"
              class="provider-row"
              :data-testid="`crossChainProvider-${provider.id}`"
            >
              <div class="provider-row__heading">
                <span>
                  <strong>{{ provider.displayName }}</strong>
                  <small>{{ provider.protocol }}</small>
                </span>
                <em :class="`provider-status provider-status--${provider.availability}`">
                  {{ providerStatus(provider.availability) }}
                </em>
              </div>
              <p>{{ providerReason(provider) }}</p>
            </article>

            <p class="other-ecosystems">{{ t('crossChainPage.otherEcosystems') }}</p>
          </details>
        </div>
      </Scroll>
    </ContentForm>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { NetworkJson } from '@extension-base/types';
import { CONTENT_FORM_HEIGHT } from '@/consts/global';
import { Components } from '@/router/routes';
import {
  buildCrossChainProviderCapabilities,
  buildOwnedCrossChainAssets,
  buildReviewedCrossChainRoutes,
  buildUnavailableCrossChainRoutes,
  type CrossChainProviderCapability,
  type CrossChainProviderAvailability,
} from '@/cross-chain/routeRegistry';
import { useAccountsStore } from '@/stores/accounts';
import { useExtensionStore } from '@/stores/extension';
import { useNetworksStore } from '@/stores/networks';
import { useI18n } from '@/locales/useI18n';

const router = useRouter();
const { t, tc } = useI18n();
const accountsStore = useAccountsStore();
const extensionStore = useExtensionStore();
const networksStore = useNetworksStore();
const contentHeight = CONTENT_FORM_HEIGHT;
const originChainId = ref('');
const assetKey = ref('');
const routeId = ref('');

const ownedAssets = computed(() => buildOwnedCrossChainAssets(accountsStore.balances, networksStore.allNetworks));
const originNetworks = computed<NetworkJson[]>(() =>
  networksStore.allNetworks.filter((network) =>
    ownedAssets.value.some((asset) => asset.networkChainId === String(network.chainId))
  )
);
const originAssets = computed(() => ownedAssets.value.filter((asset) => asset.networkChainId === originChainId.value));
const selectedAsset = computed(() => originAssets.value.find((asset) => asset.key === assetKey.value));
const network = computed(() =>
  networksStore.allNetworks.find(({ chainId }) => String(chainId) === originChainId.value)
);
const actions = computed(() => extensionStore.features?.actions ?? {});
const providerCapabilities = computed(() => buildCrossChainProviderCapabilities(actions.value));
const reviewedRoutes = computed(() => {
  if (!selectedAsset.value || !network.value) return [];

  return [
    ...buildReviewedCrossChainRoutes({
      asset: selectedAsset.value,
      origin: network.value,
      networks: networksStore.allNetworks,
      actions: actions.value,
    }),
    ...buildUnavailableCrossChainRoutes({
      asset: selectedAsset.value,
      origin: network.value,
      networks: networksStore.allNetworks,
    }),
  ].sort(
    (left, right) =>
      Number(right.enabled) - Number(left.enabled) || left.destinationNetwork.localeCompare(right.destinationNetwork)
  );
});
const selectedRoute = computed(() => reviewedRoutes.value.find((route) => route.id === routeId.value));
const selectedAccount = computed(() =>
  accountsStore.accounts.find(({ address }) => address === accountsStore.selectedWallet.address)
);
const accountCapability = computed(() => {
  if (!selectedAccount.value) return { signable: false, reason: t('crossChainPage.accountReason.addOrigin') };
  if (selectedAccount.value.isHardware) {
    return { signable: false, reason: t('crossChainPage.accountReason.hardware') };
  }
  if (selectedAccount.value.isExternal || selectedAccount.value.isInjected) {
    return { signable: false, reason: t('crossChainPage.accountReason.external') };
  }

  return { signable: true, reason: '' };
});
const shortOriginAddress = computed(() => {
  const address = accountsStore.selectedWallet.address;

  return address.length > 18 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address || t('crossChainPage.noAccount');
});
const ecosystem = computed(() => String(network.value?.ecosystem ?? '').toLowerCase());
const unavailableMessage = computed(() => {
  if (['ton', 'bitcoin', 'solana', 'iroha', 'ethereum', 'evm'].includes(ecosystem.value)) {
    return t('crossChainPage.networkRoutesUnavailable', { network: network.value?.name ?? '' });
  }
  return t('crossChainPage.assetRouteUnavailable');
});
const minimumLabel = computed(() =>
  selectedRoute.value?.enabled === false
    ? t('crossChainPage.unavailable')
    : selectedRoute.value?.minimum === null
      ? t('crossChainPage.quotedLive')
      : `${selectedRoute.value?.minimum ?? ''} ${selectedAsset.value?.symbol ?? ''}`
);
const localizedFeeDescription = computed(() => {
  if (!selectedRoute.value) return '';
  if (selectedRoute.value.providerId === 'sora-evm-bridge') return t('crossChainPage.route.multiStepFees');
  if (selectedRoute.value.destinationFee === '0') return t('crossChainPage.route.originFeeLive');

  return t('crossChainPage.route.originAndDownstreamFee', {
    fee: selectedRoute.value.destinationFee ?? '',
    symbol: selectedAsset.value?.symbol ?? '',
  });
});
const localizedEstimatedTime = computed(() => {
  switch (selectedRoute.value?.providerId) {
    case 'wallet-xcm':
      return t('crossChainPage.estimatedTimeValues.walletXcm');
    case 'sora-substrate-bridge':
      return t('crossChainPage.estimatedTimeValues.soraSubstrate');
    case 'sora-evm-bridge':
      return t('crossChainPage.estimatedTimeValues.soraEvm');
    case 'liberland-bridge':
      return t('crossChainPage.estimatedTimeValues.liberland');
    default:
      return '';
  }
});
const localizedWarnings = computed(() => {
  if (!selectedRoute.value) return [];
  if (selectedRoute.value.providerId === 'sora-evm-bridge') {
    return [t('crossChainPage.route.noFundsSubmitted')];
  }

  return [
    t('crossChainPage.route.onlyReviewedRoute', {
      origin: selectedRoute.value.originNetwork,
      destination: selectedRoute.value.destinationNetwork,
    }),
    t('crossChainPage.route.conditionsChange'),
    ...(selectedRoute.value.destinationFee === '0' ? [] : [t('crossChainPage.route.downstreamEstimate')]),
  ];
});
const localizedDisabledReason = computed(() => {
  if (!selectedRoute.value) return '';
  if (selectedRoute.value.providerId !== 'sora-evm-bridge') return t('crossChainPage.route.disabled');

  return t(
    selectedRoute.value.originChainId === '1'
      ? 'crossChainPage.route.ethereumToSoraUnavailable'
      : 'crossChainPage.route.ethereumClaimUnavailable'
  );
});
const canContinue = computed(() => Boolean(selectedRoute.value?.enabled && accountCapability.value.signable));
const providerStatus = (availability: CrossChainProviderAvailability): string => {
  if (availability === 'available') return t('crossChainPage.providerStatus.reviewed');
  if (availability === 'action-disabled') return t('crossChainPage.providerStatus.disabled');

  return t('crossChainPage.providerStatus.unavailable');
};
const providerReason = (provider: CrossChainProviderCapability): string => {
  if (provider.availability === 'unavailable') {
    return t(
      provider.id === 'sora-evm-bridge'
        ? 'crossChainPage.providerReason.noClaimRecovery'
        : 'crossChainPage.providerReason.noExecutableRoute'
    );
  }
  if (provider.availability === 'action-disabled') return t('crossChainPage.providerReason.policyDisabled');

  return tc('crossChainPage.providerReason.availableCount', provider.reviewedRouteCount, {
    count: provider.reviewedRouteCount,
  });
};

watch(originChainId, () => {
  assetKey.value = '';
  routeId.value = '';
});

watch(assetKey, () => {
  routeId.value = '';
});

function continueRoute(): void {
  if (!canContinue.value) return;
  router.push({
    name: Components.CrossChainForm,
    params: { assetId: selectedAsset.value!.assetId, network: selectedRoute.value!.originNetwork },
    query: {
      assetKey: selectedRoute.value!.assetKey,
      destination: selectedRoute.value!.destinationNetwork,
      provider: selectedRoute.value!.providerId,
      routeId: selectedRoute.value!.id,
    },
  });
}
</script>

<style lang="scss" scoped>
.cross-chain-root {
  display: flex;
  flex-direction: column;
}

.workspace-header {
  min-height: 56px;
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

.route-builder {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 22px 16px 16px;
  text-align: left;
}

.provider-coverage {
  margin-top: 6px;
  padding-top: 18px;
  border-top: $default-border;
}

.provider-coverage__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  div,
  span {
    display: flex;
    flex-direction: column;
  }

  span {
    color: $gray-color;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  small {
    margin-top: 4px;
    color: $gray-color;
    font-size: 0.68rem;
  }

  > strong {
    color: $gray-color;
    font-size: 0.72rem;
  }
}

.provider-row {
  padding: 13px 0;
  border-top: $default-border;

  &:first-of-type {
    margin-top: 12px;
  }

  p {
    margin: 7px 0 0;
    color: $gray-color;
    font-size: 0.68rem;
    line-height: 1.45;
  }
}

.provider-row__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  > span {
    display: flex;
    min-width: 0;
    flex-direction: column;
  }

  strong {
    font-size: 0.8rem;
  }

  small {
    margin-top: 3px;
    color: $gray-color;
    font-size: 0.66rem;
  }
}

.provider-status {
  flex: 0 0 auto;
  color: $gray-color;
  font-size: 0.62rem;
  font-style: normal;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.provider-status--available {
  color: $success-color;
}

.provider-status--action-disabled,
.provider-status--unavailable {
  color: $orange-color;
}

.other-ecosystems {
  margin: 0;
  padding: 13px 0 2px;
  border-top: $default-border;
  color: $gray-color;
  font-size: 0.68rem;
  line-height: 1.45;
}

label {
  display: flex;
  flex-direction: column;
  gap: 7px;

  span {
    color: $gray-color;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
  }
}

select {
  width: 100%;
  min-height: 46px;
  padding: 0 12px;
  border: $default-border;
  border-radius: 10px;
  background: $default-background-color;
  color: $plain-white;
  font: inherit;
}

.capability-state,
.route-summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px 0;
  border-top: $default-border;
  border-bottom: $default-border;

  span,
  small {
    color: $gray-color;
    line-height: 1.35;
  }
}

.route-account {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border-left: 2px solid $gray-color;
  text-align: left;

  span,
  small {
    color: $gray-color;
    font-size: 0.7rem;
  }
}

.route-facts {
  display: grid;
  gap: 8px;
  margin: 8px 0;

  div {
    display: flex;
    justify-content: space-between;
    gap: 16px;
  }

  dt {
    color: $gray-color;
  }

  dd {
    margin: 0;
    text-align: right;
  }
}

.route-disabled {
  color: $pink-lavender-color !important;
  font-weight: 700;
}

.state-icon {
  width: 24px;
  color: $grayish-white;
}
</style>
