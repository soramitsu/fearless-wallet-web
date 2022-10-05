<template>
  <div class="accounts">
    <Input v-model="selectedWallet.name" placeholder="Wallet name" size="big" :readonly="true" />

    <template v-if="showReplacedAccounts">
      <div class="row label">Accounts with unique secrets</div>

      <AccountsItem
        v-for="{ network, asset, address } in replacedAccountsItems"
        :key="network"
        :network="network"
        :asset="asset"
        :address="address"
        @openAccountSettingsPopup="openAccountSettingsPopup(...arguments, true)"
      />
    </template>

    <template v-if="showSharedSecretAccounts">
      <div class="row label">Default accounts with a shared secret</div>

      <AccountsItem
        v-for="{ network, asset, address } in sharedAccountsItems"
        :key="network"
        :network="network"
        :asset="asset"
        :address="address"
        @openAccountSettingsPopup="openAccountSettingsPopup"
      />
    </template>
  </div>
</template>

<script lang="ts">
import { Getter } from 'vuex-class';
import { Vue, Component } from 'vue-property-decorator';
import AccountsItem from './AccountsItem.vue';
import type { SelectedWallet } from '@/store/accounts/types';
import type { Networks } from '@/interfaces';
import Input from '@/components/Input.vue';
import CircleButton from '@/components/CircleButton.vue';
import Scroll from '@/components/Scroll.vue';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { Components } from '@/router/routes';
import { getChainAccounts } from '@/helpers/accounts';

@Component({
  components: {
    Input,
    CircleButton,
    Scroll,
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

  get chainAccounts() {
    return getChainAccounts(this.networks, this.selectedWallet);
  }

  get replacedAccountsItems() {
    if (this.selectedWallet.address === '') return [];

    return this.chainAccounts.filter(({ isReplaced }) => isReplaced);
  }

  get sharedAccountsItems() {
    if (this.selectedWallet.address === '') return [];

    return this.chainAccounts.filter(({ isReplaced }) => !isReplaced);
  }

  back() {
    this.$router.push({ name: Components.Wallet });
  }

  openAccountSettingsPopup(network: string, event: Event, isReplaceAccount = false) {
    this.$emit('openAccountSettingsPopup', network, event, isReplaceAccount);
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
