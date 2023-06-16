<template>
  <div class="history-book">
    <div v-if="showRecent" class="label">
      {{ $t('assets.recent') }}
    </div>

    <div v-for="address in historyAddresses" :key="address" class="row" @click="setRecipient(address)">
      <div class="description">
        <Identicon class="identicon" :size="24" theme="polkadot" :value="address" />

        <div class="full-description">
          <div class="address">{{ cut(address) }}</div>
        </div>
      </div>

      <Icon icon="plus-pink" class="plus" @click="setAddress(address)" />
    </div>

    <template v-for="[key, addressBook] in splitAddressBook">
      <div class="label" :key="key">{{ key }}</div>

      <div v-for="{ name, address } in addressBook" :key="address" class="row" @click="setRecipient(address)">
        <div class="description">
          <Identicon class="identicon" :size="24" theme="polkadot" :value="address" />

          <div class="full-description">
            <div class="name">{{ name }}</div>

            <div class="address">{{ cut(address) }}</div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { Identicon } from '@polkadot/vue-identicon';
import { storage } from '@extension-base/stores/Storage';
import type { GetHistory } from '@/interfaces';
import type { SelectedWallet, GetNetwork } from '@/store';
import type { AddressBook } from '@extension-base/background/types/types';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { cut } from '@/helpers/common';
import { NetworksController } from '@/controllers';
import { getType } from '@/helpers/history';
import { TransactionType } from '@/interfaces/history';

@Component({
  components: { Identicon },
})
export default class HistoryBook extends Vue {
  addressBook: AddressBook = [];

  @Prop(String) network!: string;
  @Prop(String) assetId!: string;
  @Getter(NetworksGettersTypes.getHistory) getHistory!: GetHistory;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: GetNetwork;

  get showRecent() {
    return this.historyAddresses.length !== 0;
  }

  get addressPrefix() {
    return this.getNetwork(this.network)?.addressPrefix;
  }

  get historyAddresses() {
    if (!this.network) return [];

    const addresses =
      this.getHistory(this.assetId, this.selectedWallet.address, this.network.toLowerCase())
        ?.nodes.filter((item) => getType(item) === TransactionType.transfer)
        .map(({ transfer }) => BaseApi.encodeAddress(transfer?.to ?? '', this.addressPrefix)) ?? [];

    return Array.from(new Set(addresses))
      .filter(
        (address) =>
          !this.addressBook.some(
            ({ address: addressFromBook }) => BaseApi.encodeAddress(address) === BaseApi.encodeAddress(addressFromBook)
          )
      )
      .slice(0, 11);
  }

  get splitAddressBook() {
    const sortedAddressBook = this.addressBook.sort(({ name: name1 }, { name: name2 }) => name1.localeCompare(name2));

    const splitObj = sortedAddressBook.reduce((result, { address, name }) => {
      const firstChar = name[0].toUpperCase();
      const addressByNetwork = BaseApi.encodeAddress(address, this.addressPrefix);

      if (result[firstChar]) result[firstChar].push({ name, address: addressByNetwork });
      else result[firstChar] = [{ name, address: addressByNetwork }];

      return result;
    }, {} as Record<string, Record<string, string>[]>);

    return Object.entries(splitObj);
  }

  @Watch('assetId')
  @Watch('selectedNetwork')
  async networkWatcher() {
    this.fetchHistory();
  }

  async mounted() {
    this.fetchHistory();

    const { addressBook } = await storage.get(['addressBook']);

    this.addressBook = addressBook;
  }

  async fetchHistory() {
    if (this.historyAddresses.length !== 0) return;

    await NetworksController.fetchHistory(this.network, this.selectedWallet, this.assetId);
  }

  cut(value: string) {
    return cut(value);
  }

  setRecipient(address: string) {
    this.$emit('setRecipient', address);
  }

  setAddress(address: string) {
    this.$emit('setAddress', address);
  }
}
</script>

<style lang="scss" scoped>
.history-book {
  padding: 10px 16px;

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
    border-bottom: 1px solid $default-background-color;

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
</style>
