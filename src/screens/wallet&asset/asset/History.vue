<template>
  <ContentForm :height="contentFormHeight">
    <div class="history">
      <div class="history-settings">
        <div class="history-label">{{ $t('assets.history') }}:</div>

        <Dropdown
          v-if="!isTonWallet"
          :value="filterHistoryValue"
          :options="historyDropdownOption"
          data-testid="historyFilter"
          @handler="filterHistoryValueUpdate"
        />
      </div>

      <Scroll>
        <div :class="historyContainerClasses">
          <Loader v-if="showLoader" />

          <div v-else-if="isEmptyHistory" data-testid="noHistory">{{ $t('assets.noHistory') }}</div>

          <template v-else>
            <HistoryItem
              v-for="(historyElement, index) in filteredHistory"
              :key="index"
              :historyElement="historyElement"
              :token="currency"
              :network="selectedNetwork"
              :address="accountsStore.selectedWallet.address"
              data-testid="historyItem"
              @click="openHistoryDetails(historyElement)"
            />
          </template>
        </div>
      </Scroll>
    </div>
  </ContentForm>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import HistoryItem from './HistoryItem.vue';
import type { FilterHistory, HistoryElement, SoraHistoryElement, SubqueryHistory } from '@/interfaces';
import type { TokenGroup } from '@extension-base/background/types/types';
import BaseApi from '@/util/BaseApi';
import { getUtilityAsset } from '@/helpers/currencies';
import { isSora } from '@/helpers';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { MENU_HEIGHT } from '@/screens/main/menu.constants';

defineProps<{
  currency: TokenGroup;
}>();

const emit = defineEmits<{
  openHistoryDetailsForm: [history: HistoryElement];
}>();

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const route = useRoute();

const filterHistoryValue = ref<FilterHistory>('all');
const showLoader = ref(false);
const refreshTimeout = 30000;

const selectedNetwork = computed(() => (route.params.selectedNetwork as string | undefined) ?? '');
const assetId = computed(() => route.params.assetId as string);

const history = computed<SubqueryHistory | undefined>(() => {
  if (!selectedNetwork.value)
    return { nodes: [], pageInfo: { endCursor: '0', startCursor: '0' }, timestamp: Number.MIN_VALUE };

  return networksStore.getHistory(assetId.value, selectedNetwork.value.toLowerCase());
});

const historyTimestamp = computed(() => (history.value ? history.value.timestamp : Number.MIN_VALUE));

const historyItems = computed<HistoryElement[]>(() => {
  if (!history.value) return [];

  return history.value.nodes;
});

const isTonWallet = computed(() => accountsStore.selectedWallet.isTon);
const isSoraNetwork = computed(() => isSora(selectedNetwork.value));

const isMainNetwork = computed(() => {
  if (selectedNetwork.value === '' || accountsStore.balances.length === 0) return false;

  const { groupId } = getUtilityAsset(accountsStore.balances, selectedNetwork.value);

  return assetId.value === groupId;
});

const isEthereumNativeNetwork = computed(() => BaseApi.isEthereumNativeNetwork(selectedNetwork.value));

const filteredHistory = computed(() => {
  if (filterHistoryValue.value === 'all') return historyItems.value;

  const field = filterHistoryValue.value as 'transfer' | 'reward';

  if (isSoraNetwork.value) {
    const value = field === 'reward' ? 'rewarded' : field;

    const filtered = (historyItems.value as unknown as SoraHistoryElement[]).filter((historyItem) => {
      return historyItem.method === value;
    });

    return filtered as unknown as HistoryElement[];
  }

  return historyItems.value.filter((historyItem) => historyItem[field]);
});

const historyDropdownOption = computed(() => {
  const options = [
    { label: 'assets.all', value: 'all' },
    { label: 'assets.transfer', value: 'transfer' },
    { label: 'assets.reward', value: 'reward' },
  ];

  if (!isSoraNetwork.value) options.push({ label: 'assets.extrinsic', value: 'extrinsic' });

  return options;
});

const contentFormHeight = computed(() => (isTonWallet.value ? 209 + MENU_HEIGHT : 209));

const isEmptyHistory = computed(() => filteredHistory.value?.length === 0);

const historyContainerClasses = computed(() => [
  'history-content',
  {
    'empty-history': isEmptyHistory.value,
  },
]);

async function loadHistory() {
  if (historyTimestamp.value + refreshTimeout > Date.now()) return false;

  if (!isSoraNetwork.value && !isTonWallet.value && !isEthereumNativeNetwork.value && !isMainNetwork.value) return;

  if (historyItems.value.length === 0) showLoader.value = true;

  const options = { networkName: selectedNetwork.value, assetId: assetId.value };

  networksStore.fetchHistory(options).finally(() => {
    showLoader.value = false;
  });

  return true;
}

watch(
  [
    selectedNetwork,
    () => accountsStore.selectedWallet.address,
    () => accountsStore.selectedWallet.ethereumAddress,
    isMainNetwork,
  ],
  () => {
    void loadHistory();
  }
);

onMounted(() => {
  setTimeout(() => {
    void loadHistory();
  }, 300);
});

function filterHistoryValueUpdate(name: FilterHistory) {
  filterHistoryValue.value = name;
}

function openHistoryDetails(history: HistoryElement) {
  emit('openHistoryDetailsForm', history);
}
</script>

<style lang="scss" scoped>
.history {
  height: 100%;
  display: flex;
  flex-direction: column;

  .history-settings {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 11px $default-padding 5px 18px;

    .history-label {
      font-weight: 600;
    }
  }

  .history-content {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .empty-history {
    align-items: center;
    justify-content: center;
    margin-top: -26px;
  }
}
</style>
