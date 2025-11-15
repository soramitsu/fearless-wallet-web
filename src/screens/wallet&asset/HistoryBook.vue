<template>
  <div class="history-book">
    <Scroll>
      <div class="history">
        <div v-if="showHistoryAndBook">
          <div v-if="showHistory">
            <div class="label" data-testid="recentLabel">
              {{ $t('assets.recent') }}
            </div>

            <div v-for="address in historyAddresses" :key="address" class="row" @click="setRecipient(address)">
              <div class="description">
                <img v-if="isTonWallet" :src="tonIcon" />

                <Identicon v-else :address="address" />

                <div class="full-description">
                  <div class="address" data-testid="address">{{ cut(address) }}</div>
                </div>
              </div>

              <Icon icon="plus-pink" class="plus" data-testid="setAddress" @click.stop="openEditBook(address)" />
            </div>
          </div>

          <div v-for="group in splitAddressBook" :key="group.letter" class="address-book-group">
            <div class="label" data-testid="labelKey">{{ group.letter }}</div>

            <div
              v-for="item in group.addresses"
              :key="item.name + item.address"
              class="row"
              @click="setRecipient(item.address)"
            >
              <div class="description">
                <img v-if="isTonWallet" :src="tonIcon" />

                <Identicon v-else :address="item.address" />

                <div class="full-description">
                  <div class="name" data-testid="name">{{ item.name }}</div>
                  <div class="address" data-testid="address">{{ cut(item.address) }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else data-testid="noHistory">{{ $t('assets.noHistory') }}</div>
      </div>
    </Scroll>

    <FButton
      size="big"
      fontSize="big"
      width="100%"
      text="assets.createContact"
      data-testid="createContactBtn"
      @click="openEditBook"
    />
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { storage } from '@extension-base/stores/Storage';
import type { AddressBook } from '@extension-base/background/types/types';
import BaseApi from '@/util/BaseApi';
import { cut, isSameString, isSora } from '@/helpers/';
import { getType } from '@/helpers/history';
import { type SoraHistoryElement, TransactionType, type TonEvent } from '@/interfaces/history';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { TON_ICON } from '@/consts/networks';

defineOptions({
  name: 'HistoryBook',
});

const props = defineProps<{
  network: string;
  assetId: string;
}>();

const emit = defineEmits<{
  setRecipient: [address: string];
  toggleHistoryBookVisibility: [];
  toggleEditBook: [address?: string];
}>();

const accountsStore = useAccountsStore();
const networksStore = useNetworksStore();
const addressBook = ref<AddressBook>({});
const tonIcon = TON_ICON;

const showHistory = computed(() => historyAddresses.value.length !== 0);
const isTonWallet = computed(() => accountsStore.selectedWallet.isTon);

const addressPrefix = computed(() => networksStore.getNetwork(props.network)?.addressPrefix);

const book = computed(() => {
  const addresses = [...(addressBook.value.all ?? []), ...(addressBook.value[props.network] ?? [])];

  return Array.from(new Set(addresses));
});

const showHistoryAndBook = computed(() => showHistory.value || book.value.length !== 0);

const addressByConditions = computed(() => {
  if (!props.network) return [];

  const history = networksStore.getHistory(props.assetId, props.network.toLowerCase());

  if (!history) return [];

  if (isSora(props.network)) {
    return (history.nodes as unknown as SoraHistoryElement[]).flatMap((item) => {
      if (item.method !== 'transfer') return [];

      return BaseApi.encodeAddress(item.data?.to ?? '', addressPrefix.value) ?? [];
    });
  }

  if (isTonWallet.value) {
    return (history.nodes as unknown as TonEvent[]).flatMap((item) => item.to ?? []);
  }

  return history.nodes.flatMap((item) => {
    if (getType(item) !== TransactionType.transfer) return [];

    return BaseApi.encodeAddress(item.transfer?.to ?? '', addressPrefix.value) ?? [];
  });
});

const historyAddresses = computed(() =>
  Array.from(new Set(addressByConditions.value))
    .filter((address) => {
      return !book.value.some(({ address: addressFromBook }) => {
        if (isTonWallet.value) {
          return isSameString(address, addressFromBook);
        }

        return isSameString(BaseApi.encodeAddress(address), BaseApi.encodeAddress(addressFromBook));
      });
    })
    .slice(0, 11)
);

const splitAddressBook = computed(() => {
  const sortedAddressBook = [...book.value].sort(({ name: name1 = '' }, { name: name2 = '' }) =>
    name1.localeCompare(name2)
  );

  const map = new Map<string, { name: string; address: string }[]>();

  sortedAddressBook.forEach(({ address, name = '' }) => {
    const firstChar = name[0]?.toUpperCase() ?? '#';
    const addressByNetwork = BaseApi.encodeAddress(address, addressPrefix.value);
    const bucket = map.get(firstChar) ?? [];

    bucket.push({ name, address: addressByNetwork ?? address });
    map.set(firstChar, bucket);
  });

  return Array.from(map.entries()).map(([letter, addresses]) => ({ letter, addresses }));
});

const loadHistory = () => {
  if (!props.network || !props.assetId) return;
  if (historyAddresses.value.length !== 0) return;

  networksStore.fetchHistory({ networkName: props.network, assetId: props.assetId });
};

watch(
  () => props.assetId,
  () => loadHistory()
);

watch(
  () => accountsStore.selectedNetwork,
  () => loadHistory()
);

watch(
  () => props.network,
  () => loadHistory()
);

onMounted(async () => {
  loadHistory();

  const { addressBook: savedAddressBook } = await storage.get(['addressBook']);

  addressBook.value = savedAddressBook ?? {};
});

const setRecipient = (address: string) => {
  emit('setRecipient', address);
  emit('toggleHistoryBookVisibility');
};

const openEditBook = (address = '') => {
  emit('toggleEditBook', address);
};
</script>

<style lang="scss" scoped>
.history-book {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;

  .history {
    padding: 10px 16px;
    height: 100%;

    .label {
      font-weight: 700;
      font-size: 0.75rem;
      text-transform: uppercase;
      color: $default-white;
      text-align: left;
      margin: 20px 0 10px 0;
    }

    .row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: $default-border;

      &:last-child {
        border: none;
      }

      .plus {
        width: 15px;
        height: 15px;
        cursor: pointer;
        opacity: 0.9;

        &:hover {
          opacity: 1;
        }
      }

      .description {
        display: flex;
        align-items: center;
        height: 65px;
        cursor: pointer;
        text-align: left;

        &:hover {
          .address {
            color: $default-white;
          }
        }

        .address {
          color: rgba(255, 255, 255, 0.64);
          font-size: 0.875em;
        }

        .full-description {
          margin-left: 25px;

          .address {
            margin-top: 5px;
          }
        }
      }
    }
  }
}
</style>
