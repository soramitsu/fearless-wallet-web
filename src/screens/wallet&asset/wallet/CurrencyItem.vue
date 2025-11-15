<template>
  <LazyRender v-if="showCurrencyItem" :timeoutCallback="timeoutCallback" class="currency-item" @click="openAssetPage">
    <div v-if="showAssetsManagementForm" class="drag-icon">
      <SIcon name="basic-menu-24" class="handle" />
    </div>

    <div class="img-container">
      <img v-if="isCrv" src="@/assets/crv.png" class="asset-icon crv" />

      <ExternalLogo v-else class="asset-icon" :name="assetData.icon" :width="42" />
    </div>

    <div class="descriptions-column">
      <div class="row first-row">
        <div data-testid="tokenName">{{ tokenName }}</div>

        <template>
          <Shimmer v-if="showShimmers" height="14px" width="60px" />

          <template v-else-if="!showWarning">
            <div class="available-networks">
              <ExternalLogo
                v-for="{ icon, name } in networkBadges"
                class="minor-network-img"
                :key="name"
                :name="icon"
                :width="12"
              />

              <div v-if="isAdditional" class="additional">+{{ additionalCount }}</div>
            </div>
          </template>
        </template>
      </div>

      <div class="row second-row">
        <div class="currency-name overflow" data-testid="currencyName">{{ assetData.symbol.toUpperCase() }}</div>

        <Shimmer v-if="showShimmers" height="23px" width="60px" />

        <div v-else-if="!showWarning" class="count-assets overflow" data-testid="countAssets">
          {{ totalAssetBalanceValue }}
        </div>
      </div>

      <div v-if="showPriceRow" class="row third-row">
        <div class="price row" data-testid="price">
          {{ assetFiat }}

          <div :class="changePriceClasses" data-testid="changePrice">{{ assetFiatChange }}</div>
        </div>

        <Shimmer v-if="showShimmers" height="14px" width="70px" />

        <div v-else-if="!showWarning" class="total-balance overflow" data-testid="totalBalance">
          {{ transferableFiatBalanceValue }}
        </div>
      </div>
    </div>
    <div class="activity">
      <template v-if="showWarning">
        <Icon icon="info-triangle" className="warning-img" @click="onToggleNetworkManagementVisible" />

        <Tooltip text="common.networkDisconnected" target=".warning-img" placement="left" />
      </template>

      <Switcher v-if="showAssetsManagementForm" :value="currencyVisible" @change="toggleCurrencyVisible" />

      <template v-else-if="!showWarning">
        <CircleButton
          iconName="send-white"
          backgroundColor="black"
          class="button send"
          tooltipText="assets.sendButtonText"
          target=".send"
          data-testid="sendBtn"
          @click="onRoute('send')"
        />

        <CircleButton
          iconName="receive-white"
          backgroundColor="black"
          class="button receive"
          tooltipText="assets.receiveButtonText"
          target=".receive"
          data-testid="receiveBtn"
          @click="onRoute('receive')"
        />

        <CircleButton
          iconName="chevron-right"
          backgroundColor="none"
          backgroundColorHover="black"
          class="details"
          tooltipText="wallet.assetDetails"
          target=".details"
          data-testid="detailsBtn"
        />
      </template>
    </div>
  </LazyRender>
</template>

<script lang="ts" setup>
import { computed, inject, toRefs } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { APIItemState, NETWORK_STATUS } from '@extension-base/api/types/networks';
import { getBalanceNetworkName } from '@extension-base/api/evm/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import { Components } from '@/router/routes';
import {
  filterBalanceItemsByNetwork,
  getSummaryTransferableBalanceFilteredByActiveNetworks,
} from '@/helpers/currencies';
import { networkMatchesSelection, isNetworkGroup } from '@/helpers/networkGroups';
import { isSameString } from '@/helpers';
import BaseApi from '@/util/BaseApi';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { WalletMetadataKey } from '@/screens/wallet&asset/wallet/metadata';
import { useWalletMetadata } from '@/composables/useWalletMetadata';

type CurrencyItemProps = {
  assetData: TokenGroup;
  selectedNetwork: string;
  showAssetsManagementForm: boolean;
  timeoutCallback?: (fn: () => void) => (() => void) | undefined;
};

const props = defineProps<CurrencyItemProps>();
const emit = defineEmits<{
  (_event: 'toggleNetworkManagementVisible'): void;
}>();

const router = useRouter();
const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const { n } = useI18n();

const { assetData, selectedNetwork, showAssetsManagementForm, timeoutCallback } = toRefs(props);

const COUNT_DISPLAYED_NETWORKS = 5;

const selectedWallet = computed(() => accountsStore.selectedWallet);
const walletAccounts = computed(() => accountsStore.accounts);

const injectedWalletMetadata = inject(WalletMetadataKey, null);

const fallbackWalletMetadata = useWalletMetadata(() => ({
  selection: selectedNetwork.value,
  tokenGroups: [assetData.value],
}));

const walletSelection = computed(() => {
  if (injectedWalletMetadata) return injectedWalletMetadata.value.selection;

  return fallbackWalletMetadata.value.selection;
});

const isCrv = computed(() => assetData.value.symbol === 'crv');
const tokenName = computed(() => assetData.value.tokenName.toUpperCase() ?? '');
const groupId = computed(() => assetData.value.groupId);

const isCurrentNetwork = computed(() => !isNetworkGroup(selectedNetwork.value));

const networkJson = computed(() => {
  if (!isCurrentNetwork.value) return undefined;

  try {
    return networksStore.getNetwork(selectedNetwork.value);
  } catch (error) {
    return undefined;
  }
});

const priceJson = computed(() => networksStore.getAssetPrice(assetData.value.priceId ?? ''));
const showPriceRow = computed(() => priceJson.value.isExist);

const filteredBalances = computed(() =>
  assetData.value.balances.filter((balance) => {
    const networkName = getBalanceNetworkName(balance);
    const { state } = balance;

    if (selectedWallet.value.isMobile) {
      const account = walletAccounts.value.find(({ address }) => address === selectedWallet.value.address);
      const network = networksStore.getNetwork(networkName);

      if (account?.chains?.length) {
        return (
          account.chains.some((halfChainId) => network.chainId.includes(halfChainId)) && state === APIItemState.READY
        );
      }
    }

    return state === APIItemState.READY;
  })
);

const isAdditional = computed(() => filteredBalances.value.length > COUNT_DISPLAYED_NETWORKS);
const additionalCount = computed(() => filteredBalances.value.length - (COUNT_DISPLAYED_NETWORKS - 1));

const currencyVisible = computed(() => !accountsStore.hiddenAssets.includes(assetData.value.groupId));
const showCurrencyItem = computed(() => showAssetsManagementForm.value || currencyVisible.value);

const activeNetworks = computed(() => {
  const selection = walletSelection.value;

  return assetData.value.balances
    .filter((balance) => {
      const networkName = getBalanceNetworkName(balance);
      const { active } = networksStore.getNetwork(networkName);

      if (!active) return false;

      if (selection.allowedNames.size > 0) return networkMatchesSelection(selection, networkName);

      return isSameString(selectedNetwork.value, networkName);
    })
    .filter(({ state }) => state === APIItemState.READY);
});

const networkBadges = computed(() => {
  const selection = walletSelection.value;

  if (isCurrentNetwork.value) {
    const network = assetData.value.balances.find((balance) => {
      const networkName = getBalanceNetworkName(balance);
      const account = walletAccounts.value.find(({ address }) => address === selectedWallet.value.address);
      const net = networksStore.getNetwork(networkName);

      if (account?.chains?.length && !account.chains.some((halfChainId) => net.chainId.includes(halfChainId))) {
        return false;
      }

      return filterBalanceItemsByNetwork(balance, selection);
    });

    if (network) {
      const { icon } = network;
      const networkName = getBalanceNetworkName(network);

      return [{ icon, name: networkName }];
    }

    return [];
  }

  if (isAdditional.value) return filteredBalances.value.slice(0, COUNT_DISPLAYED_NETWORKS - 1);

  return filteredBalances.value;
});

const showWarning = computed(() => {
  if (isCurrentNetwork.value) {
    return networkJson.value?.networkStatus === NETWORK_STATUS.DISCONNECTED;
  }

  const allNetworksDisconnected = assetData.value.balances.every((balance) => {
    const network = networksStore.getNetwork(getBalanceNetworkName(balance));

    return network?.networkStatus === NETWORK_STATUS.DISCONNECTED;
  });

  if (allNetworksDisconnected) return true;

  return (
    assetData.value.balances.some(
      (balance) => balance.state === APIItemState.ERROR && getBalanceNetworkName(balance) === selectedNetwork.value
    ) || assetData.value.balances.every((balance) => balance.state === APIItemState.ERROR)
  );
});

const showShimmers = computed(() => {
  if (showWarning.value) return false;

  return !assetData.value.balances.some(({ state }) => state === APIItemState.READY);
});

const mainNetwork = computed(() => {
  if (isCurrentNetwork.value) return networkJson.value?.name ?? '';

  const activeBalances = assetData.value.balances.filter(
    (balance) => networksStore.getNetwork(getBalanceNetworkName(balance)).active
  );

  if (assetData.value.relayChain === 'ethereum') {
    const networkName =
      (activeBalances[0] && getBalanceNetworkName(activeBalances[0])) ||
      (assetData.value.balances[0] && getBalanceNetworkName(assetData.value.balances[0]));

    if (!networkName) return '';

    return networksStore.getNetwork(networkName).name;
  }

  if (BaseApi.isEthereumNetwork(assetData.value.mainNetwork) && !selectedWallet.value.hasEthereum) {
    const balanceWithTokens = activeBalances.find(({ transferable }) => transferable && transferable !== '0');
    const networkWithTokens =
      (balanceWithTokens && getBalanceNetworkName(balanceWithTokens)) ||
      (assetData.value.balances[0] && getBalanceNetworkName(assetData.value.balances[0]));

    if (!networkWithTokens) return '';

    return networksStore.getNetwork(networkWithTokens).name;
  }

  const fallbackBalance = activeBalances[0] ?? assetData.value.balances[0];
  const fallback = fallbackBalance ? getBalanceNetworkName(fallbackBalance) : undefined;

  if (!fallback) return '';

  return networksStore.getNetwork(fallback).name;
});

const redirectNetwork = computed(() => {
  if (isCurrentNetwork.value) return selectedNetwork.value;

  const netName = activeNetworks.value[0] ? getBalanceNetworkName(activeNetworks.value[0]) : undefined;

  if (!netName) return selectedNetwork.value;

  return networksStore.getNetwork(netName).name;
});

const transferableAssetBalance = computed(
  () => +getSummaryTransferableBalanceFilteredByActiveNetworks(assetData.value, selectedNetwork.value)
);
const transferableFiatBalance = computed(() => transferableAssetBalance.value * priceJson.value.price);

const totalAssetBalanceValue = computed(() => n(transferableAssetBalance.value, 'decimal'));
const assetFiat = computed(() => `${accountsStore.fiatSymbol}${n(priceJson.value.price, 'price')}`);
const transferableFiatBalanceValue = computed(
  () => `${accountsStore.fiatSymbol}${n(transferableFiatBalance.value, 'price')}`
);
const assetFiatChange = computed(() => {
  if (!priceJson.value.priceChange) return '';

  return n(priceJson.value.priceChange, 'percent');
});

const changePriceClasses = computed(() => {
  const classes = ['price-change'];

  if (priceJson.value.priceChange > 0) classes.push('up-price');
  else if (priceJson.value.priceChange < 0) classes.push('down-price');

  return classes;
});

const toggleCurrencyVisible = (value: boolean) => {
  accountsStore.setHiddenAssets({ groupId: assetData.value.groupId, value });
};

const onToggleNetworkManagementVisible = () => {
  emit('toggleNetworkManagementVisible');
};

const openAssetPage = (event: Event) => {
  if (showWarning.value) return;

  const target = event.target as HTMLElement | null;

  if (
    showAssetsManagementForm.value ||
    target?.classList.contains('button') ||
    target?.classList.contains('send-white') ||
    target?.classList.contains('receive-white')
  ) {
    return;
  }

  if (isCurrentNetwork.value || activeNetworks.value.length === 1) {
    router.push({
      name: Components.AssetHistory,
      params: {
        assetId: groupId.value,
        selectedNetwork: redirectNetwork.value,
      },
    });
  } else {
    router.push({
      name: Components.AssetNetworks,
      params: {
        assetId: groupId.value,
      },
    });
  }
};

const onRoute = (form: 'send' | 'receive') => {
  router.push({
    name: form === 'send' ? Components.SendForm : Components.ReceiveForm,
    params: {
      assetId: groupId.value ?? '',
      network: mainNetwork.value ?? '',
    },
  });
};
</script>

<style lang="scss" scoped>
.currency-item {
  display: flex;
  padding: 8px 0 8px 14px;
  border-bottom: $default-border;
  margin-right: 16px;
  align-items: center;
  height: 80px;
  user-select: none;

  &:hover {
    cursor: pointer;
  }

  &:last-child {
    border-bottom: none;
  }

  .drag-icon {
    margin: auto 20px auto 0;

    &:hover {
      cursor: pointer;
    }

    i {
      color: #fff;
    }
  }

  .descriptions-column {
    width: 100%;

    .row {
      display: flex;
      justify-content: space-between;
    }

    .first-row {
      font-size: 0.75rem;
      color: $gray-color;
      margin-bottom: 5px;
      height: 14px;

      .available-networks {
        display: flex;
      }

      .additional {
        border-radius: 50%;

        &:hover {
          cursor: pointer;
        }
      }
    }

    .second-row {
      font-weight: 700;
      margin-bottom: 5px;

      .currency-name {
        font-size: 1.25rem;
        text-transform: uppercase;
        max-width: 220px;
      }

      .count-assets {
        max-width: 200px;
        font-size: 1.125em;
        margin: auto 0;
      }
    }

    .third-row {
      display: flex;
      font-size: 0.75rem;
      color: $default-white;
      height: 14px;

      .price {
        max-width: 100px;
      }

      .price-change {
        margin-left: 2px;
      }

      .total-balance {
        max-width: 200px;
      }
    }
  }

  .overflow {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .second-row-left {
    font-size: 1.25rem;
  }

  .activity {
    display: flex;
    align-items: center;
    margin-left: 16px;
  }

  .button {
    margin-right: 7px;
  }

  .warning-img {
    width: 28px;
    height: 28px;
    opacity: 0.9;
    margin-right: 10px;

    &:hover {
      opacity: 1;
    }
  }

  .img-container {
    margin: auto;
    user-select: none;

    .asset-icon {
      margin-right: 13px;
      border-radius: 50%;
    }

    .crv {
      width: 42px;
      height: 42px;
    }
  }

  .minor-network-img {
    margin-right: 3px;
    opacity: 0.5;
    user-select: none;
    border-radius: 50%;

    &:last-child {
      margin-right: 0;
    }
  }
}
</style>
