<template>
  <Fragment>
    <ContentForm :height="contentFormHeight">
      <div class="networks">
        <div class="networks-settings">
          <TabButton
            v-for="{ label, tabName, tooltipText, target, classes } in tabsOptions"
            class="tab"
            :key="tabName"
            :tooltipText="tooltipText"
            :target="target"
            :class="classes"
            :label="label"
            :isActive="activeTabName === tabName"
            data-testid="tabButton"
            @click="openTab(tabName)"
          />

          <div class="filter__icon" @click="toggleSelectFilterPopupVisibility">
            <Icon icon="filter" className="filter" data-testid="filter" />
          </div>
        </div>

        <Scroll>
          <div class="network networks-content">
            <AssetRow
              v-for="(balance, index) in sortedNetworks"
              :key="index"
              :text="getNetworkName(balance)"
              :value="getBalanceInNetworkString(balance)"
              :price="getFiatInNetworkString(balance)"
              :icon="balance.icon"
              :isIconPrepend="true"
              data-testid="assetRow"
              @openAsset="openAsset(getNetworkName(balance))"
            />
          </div>
        </Scroll>
      </div>
    </ContentForm>

    <SelectPopup
      v-if="showSelectFilterPopup"
      sizeWidth="medium"
      placeholder="common.searchNetwork"
      verticalPlacement="top"
      horizontalPlacement="center"
      :value="filterValue"
      :showBlur="true"
      :showBackground="true"
      :height="210"
      :top="285"
      :left="50"
      :showSearch="false"
      :showIcon="false"
      :options="filterDropdownOption"
      @toggleValue="filterValueUpdate"
      @handlerClose="toggleSelectFilterPopupVisibility"
    />
  </Fragment>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { APIItemState } from '@extension-base/api/types/networks';
import { getBalanceNetworkName } from '@extension-base/api/evm/types';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import AssetRow from '@/screens/wallet&asset/asset/AssetRow.vue';
import { Components } from '@/router/routes';
import { fetchEvmBalance } from '@/extension/messaging';
import BaseApi from '@/util/BaseApi';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { MENU_HEIGHT } from '@/screens/main/menu.constants';
import { isSameString } from '@/helpers';
import { createNormalizedNetworkNameSet, normalizeNetworkName } from '@/helpers/networkGroups';

interface TabsOptions {
  label: string;
  tabName: 'Assets' | 'MyAssets';
  tooltipText: string;
  classes: string;
  target: string;
}

const props = defineProps<{
  currency: TokenGroup;
}>();

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const router = useRouter();
const route = useRoute();
const { t, n } = useI18n();

const tabsOptions: TabsOptions[] = [
  {
    label: 'assets.networkAssets',
    tabName: 'Assets',
    tooltipText: 'assets.networkAssets',
    classes: 'currencies-tab',
    target: '.currencies-tab',
  },
  {
    label: 'assets.myNetworks',
    tabName: 'MyAssets',
    tooltipText: 'assets.myNetworks',
    classes: 'currencies-tab',
    target: '.currencies-tab',
  },
];

const filterDropdownOption = computed(() => [
  { name: t('assets.filters.fiat'), value: 'fiat' },
  { name: t('assets.filters.popularity'), value: 'popularity' },
  { name: t('assets.filters.name'), value: 'name' },
]);

const filterValue = ref('fiat');
const activeTabName = ref<'Assets' | 'MyAssets'>('Assets');
const showSelectFilterPopup = ref(false);

const contentFormHeight = computed(() => (accountsStore.selectedWallet.isTon ? 266 + MENU_HEIGHT : 266));

const allowedNetworkNames = computed(() =>
  createNormalizedNetworkNameSet(networksStore.networks, accountsStore.selectedNetwork, {
    favoriteAddress: accountsStore.selectedWallet.address,
  })
);

const filteredNetworks = computed(() => {
  const allowedSet = allowedNetworkNames.value;
  const selectedNetwork = accountsStore.selectedNetwork;

  const baseFilter = props.currency.balances?.filter((balance) => {
    const { state } = balance;

    if (state !== APIItemState.READY) return false;

    const networkName = getBalanceNetworkName(balance);
    const network = networksStore.getNetwork(networkName);

    if (!network.active) return false;

    if (allowedSet.size > 0) return allowedSet.has(normalizeNetworkName(networkName));

    return isSameString(networkName, selectedNetwork);
  });

  if (activeTabName.value === 'MyAssets')
    return baseFilter?.filter(({ transferable }) => transferable && +transferable > 0);

  return baseFilter;
});

const price = computed(() => {
  const assetPrice = networksStore.getAssetPrice(props.currency.priceId ?? '').price;

  return +(assetPrice ?? 0);
});

const sortedNetworks = computed(() => {
  const list = filteredNetworks.value ? [...filteredNetworks.value] : [];

  return list.sort((a, b) => {
    const nameA = getBalanceNetworkName(a);
    const nameB = getBalanceNetworkName(b);

    if (filterValue.value === 'fiat') {
      const value1 = +(a.transferable ?? 0);
      const value2 = +(b.transferable ?? 0);

      return value2 - value1;
    }

    if (filterValue.value === 'popularity') {
      const value1 = networksStore.getNetwork(nameA).rank ?? Infinity;
      const value2 = networksStore.getNetwork(nameB).rank ?? Infinity;

      return value1 - value2;
    }

    return nameA.localeCompare(nameB);
  });
});

const selectedAssetId = computed(() => route.params.assetId as string);

onMounted(() => {
  if (BaseApi.isEthereumNetwork(props.currency.mainNetwork)) fetchEvmBalance(selectedAssetId.value);
});

function openAsset(name: string) {
  const network = networksStore.getNetwork(name);

  router.push({
    name: Components.AssetHistory,
    params: {
      assetId: props.currency.groupId,
      selectedNetwork: network.name,
    },
  });
}

function openTab(name: 'Assets' | 'MyAssets') {
  activeTabName.value = name;
}

function toggleSelectFilterPopupVisibility() {
  showSelectFilterPopup.value = !showSelectFilterPopup.value;
}

function getNetworkName(balance: BalanceItem) {
  return getBalanceNetworkName(balance);
}

function getBalanceInNetwork(balance: BalanceItem) {
  const transferable = balance.transferable ?? '0';
  const prepBalance = transferable ? Number(transferable) : 0;

  return prepBalance;
}

function getBalanceInNetworkString(balance: BalanceItem) {
  return `${n(getBalanceInNetwork(balance), 'decimal')} ${props.currency.symbol.toUpperCase()}`;
}

function getFiatBalanceInNetwork(balance: BalanceItem) {
  const prepBalance = getBalanceInNetwork(balance);

  return prepBalance * +price.value ?? 0;
}

function getFiatInNetworkString(balance: BalanceItem) {
  return `${accountsStore.fiatSymbol} ${n(getFiatBalanceInNetwork(balance), 'price')}`;
}

function filterValueUpdate(name: string) {
  filterValue.value = name;

  toggleSelectFilterPopupVisibility();
}
</script>

<style lang="scss" scoped>
.networks {
  height: 100%;
  display: flex;
  flex-direction: column;

  .networks-settings {
    display: flex;
    align-items: center;
    margin: 11px $default-padding 5px 18px;
    gap: 12px;

    .filter__icon {
      margin-right: 0;
      margin-left: auto;

      .filter {
        width: 24px;
        height: 24px;
        color: $grayish-white;
        margin-left: auto;
        margin-right: 0;
      }
    }
  }

  .asset-row {
    padding-top: 16px;
    padding-bottom: 16px;
  }

  .networks-content {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .network {
    height: 200px;
  }
}
</style>
