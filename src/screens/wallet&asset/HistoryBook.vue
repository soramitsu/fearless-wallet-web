<template>
  <div class="history-book">
    <Scroll>
      <div class="history">
        <template v-if="showHistoryAndBook">
          <template v-if="showHistory">
            <div class="label" data-testid="recentLabel">
              {{ $t('assets.recent') }}
            </div>

            <div v-for="address in historyAddresses" :key="address" class="row" @click="setRecipient(address)">
              <div class="description">
                <Identicon :address="address" />

                <div class="full-description">
                  <div class="address" data-testid="address">{{ cut(address) }}</div>
                </div>
              </div>

              <Icon icon="plus-pink" class="plus" data-testid="setAddress" @click="setAddress(address)" />
            </div>
          </template>

          <template v-for="[key, addressBook] in splitAddressBook">
            <div class="label" data-testid="labelKey" :key="key">{{ key }}</div>

            <div
              v-for="{ name, address } in addressBook"
              :key="name + address"
              class="row"
              @click="setRecipient(address)"
            >
              <div class="description">
                <Identicon :address="address" />

                <div class="full-description">
                  <div class="name" data-testid="name">{{ name }}</div>

                  <div class="address" data-testid="address">{{ cut(address) }}</div>
                </div>
              </div>
            </div>
          </template>
        </template>

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

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import { Getter, Action } from 'vuex-class';
import { storage } from '@extension-base/stores/Storage';
import { toSvg } from 'jdenticon';
import { type AddressBook } from '@extension-base/background/types/types';
import type { AsyncFn, GetHistory } from '@/interfaces';
import type { FetchHistory, GetNetwork } from '@/store';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { cut, isSora } from '@/helpers/';
import { getType } from '@/helpers/history';
import { type SoraHistoryElement, TransactionType } from '@/interfaces/history';
import { ActionTypes as NetworksActionTypes } from '@/store/networks/actions';

@Component
export default class HistoryBook extends Vue {
  addressBook: AddressBook = {};

  @Prop(String) network!: string;
  @Prop(String) assetId!: string;
  @Getter(NetworksGettersTypes.getHistory) getHistory!: GetHistory;
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: GetNetwork;
  @Action(NetworksActionTypes.FETCH_HISTORY) fetchHistory!: AsyncFn<FetchHistory>;

  get showHistoryAndBook() {
    return this.showHistory || this.book.length !== 0;
  }

  get showHistory() {
    return this.historyAddresses.length !== 0;
  }

  get addressPrefix() {
    return this.getNetwork(this.network)?.addressPrefix;
  }

  get book() {
    const addresses = [...(this.addressBook['all'] ?? []), ...(this.addressBook[this.network] ?? [])];

    return Array.from(new Set(addresses));
  }

  get historyAddresses() {
    if (!this.network) return [];

    const history = this.getHistory(this.assetId, this.network.toLowerCase());

    if (!history) return [];

    const addresses = isSora(this.network)
      ? (history.nodes as unknown as SoraHistoryElement[]).flatMap((item) => {
          if (item.method !== 'transfer') return [];

          return BaseApi.encodeAddress(item.data?.to ?? '', this.addressPrefix) ?? [];
        })
      : history?.nodes.flatMap((item) => {
          if (getType(item) !== TransactionType.transfer) return [];

          return BaseApi.encodeAddress(item.transfer?.to ?? '', this.addressPrefix) ?? [];
        });

    return Array.from(new Set(addresses))
      .filter(
        (address) =>
          !this.book.some(
            ({ address: addressFromBook }) => BaseApi.encodeAddress(address) === BaseApi.encodeAddress(addressFromBook)
          )
      )
      .slice(0, 11);
  }

  get splitAddressBook() {
    const sortedAddressBook = this.book.sort(({ name: name1 }, { name: name2 }) => name1.localeCompare(name2));

    const splitObj = sortedAddressBook.reduce<AddressBook>((result, { address, name }) => {
      const firstChar = name[0].toUpperCase();
      const addressByNetwork = BaseApi.encodeAddress(address, this.addressPrefix);

      if (result[firstChar]) result[firstChar].push({ name, address: addressByNetwork });
      else result[firstChar] = [{ name, address: addressByNetwork }];

      return result;
    }, {});

    return Object.entries(splitObj);
  }

  @Watch('assetId')
  @Watch('selectedNetwork')
  networkWatcher() {
    this.loadHistory();
  }

  async mounted() {
    this.loadHistory();

    const { addressBook } = await storage.get(['addressBook']);

    this.addressBook = addressBook;
  }

  loadHistory() {
    if (this.historyAddresses.length !== 0) return;

    this.fetchHistory({ networkName: this.network, assetId: this.assetId });
  }

  getJdenticon(address: string) {
    return toSvg(address, 24);
  }

  cut(value: string) {
    return cut(value);
  }

  setRecipient(address: string) {
    this.$emit('setRecipient', address);
    this.$emit('toggleHistoryBookVisibility');
  }

  openEditBook() {
    this.$emit('openEditBook');
  }
}
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
      font-size: 12px;
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
          font-size: 14px;
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
