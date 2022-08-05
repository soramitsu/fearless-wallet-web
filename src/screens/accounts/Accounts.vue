<template>
  <div class="accounts">
    <Input v-model="selectedWallet.name" placeholder="Wallet name" size="big" :readonly="true" />

    <template v-if="showReplacedAccounts">
      <div class="row label">Accounts with unique secrets</div>

      <AccountsItem
        v-for="{ network, token, address } in replacedAccountsItems"
        :key="network"
        :network="network"
        :token="token"
        :address="address"
        @openAccountSettings="openAccountSettings(...arguments, true)"
      />
    </template>

    <template v-if="showSharedSecretAccounts">
      <div class="row label">Default accounts with a shared secret</div>

      <AccountsItem
        v-for="{ network, token, address } in sharedAccountsItems"
        :key="network"
        :network="network"
        :token="token"
        :address="address"
        @openAccountSettings="openAccountSettings"
      />
    </template>
  </div>
</template>

<script lang="ts">
import ContentForm from '@/components/ContentForm.vue';
import Input from '@/components/Input.vue';
import CircleButton from '@/components/CircleButton.vue';
import Scroll from '@/components/Scroll.vue';
import AccountSettingsPopup from './AccountSettingsPopup.vue';
import AccountsItem from './AccountsItem.vue';
import BaseApi from '@/util/BaseApi';
import { Getter } from 'vuex-class';
import { Vue, Component } from 'vue-property-decorator';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { Components } from '@/router/routes';
import { getImgPathByNetworkName } from '@/util/imgPath';
import type { SelectedWallet } from '@/store/accounts/types';
import type { Networks } from '@/store/networks/types';

@Component({
  components: {
    ContentForm,
    Input,
    CircleButton,
    Scroll,
    AccountSettingsPopup,
    AccountsItem,
  },
})
export default class Account extends Vue {
  selectedNetwork = '';
  selectedAddress = '';

  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.getNetworks) networks!: Networks;

  get showReplacedAccounts() {
    return this.replacedAccountsItems.length > 0;
  }

  get showSharedSecretAccounts() {
    return this.sharedAccountsItems.length > 0;
  }

  get replacedAccountsItems() {
    if (this.selectedWallet.address === '') return [];

    return this.networks
      .map(({ name, assets }) => {
        const token = assets[0].assetId;
        const accounts = BaseApi.getReplacedAccountByNetwork(this.selectedWallet, name);
        const address = accounts?.address;
        const formattedAddress = address ? BaseApi.formatAddress({ address, ethereumAddress: address }, name) : '';

        return {
          network: name,
          token,
          address: formattedAddress,
        };
      })
      .filter(({ address }) => address !== '');
  }

  get sharedAccountsItems() {
    if (this.selectedWallet.address === '') return [];

    return this.networks
      .map(({ name, assets }) => {
        const address = BaseApi.formatAddress(this.selectedWallet, name);
        const token = assets[0].assetId;

        return {
          network: name,
          token,
          address,
        };
      })
      .filter(({ network }) => !this.replacedAccountsItems.map(({ network }) => network).includes(network));
  }

  getImg(network: string) {
    if (network === '') return '';

    return require(`@/assets/networks/${getImgPathByNetworkName(network)}`);
  }

  back() {
    this.$router.push({ name: Components.Wallet });
  }

  openAccountSettings(network: string, event: Event, isReplaceAccount = false) {
    this.$emit('openAccountSettings', network, event, isReplaceAccount);
  }
}
</script>

<style lang="scss" scoped>
.accounts {
  display: flex;
  flex-direction: column;
  margin-right: 16px;

  .row {
    margin-top: 16px;
  }

  .label {
    color: rgba(255, 255, 255, 1);
    text-align: left;
    font-weight: 600;
  }
}
</style>
