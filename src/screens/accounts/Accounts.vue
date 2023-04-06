<template>
  <div class="accounts">
    <Input v-model="newName" placeholder="accounts.walletName" size="big" :maxlength="35" @blur="blurInputName" />

    <template>
      <div class="row label">{{ $t('accounts.accountsUniquesSecrets') }}</div>

      <AccountsItem
        v-for="{ network, address, networkIcon } in chainAccounts"
        :key="network"
        :network="network"
        :icon="networkIcon"
        :address="address"
        @openAccountSettingsPopup="openAccountSettingsPopup"
      />
    </template>

    <!-- <template v-if="showSharedSecretAccounts">
      <div class="row label">{{ $t('accounts.accountsDefaultSecrets') }}</div>

      <AccountsItem
        v-for="{ network, address, networkIcon } in sharedAccountsItems"
        :key="network"
        :network="network"
        :icon="networkIcon"
        :address="address"
        :isMobile="isMobileWallet"
        @openAddEthereumAccountPopup="$emit('openAddEthereumAccountPopup')"
        @openAccountSettingsPopup="openAccountSettingsPopup"
      />
    </template> -->
  </div>
</template>

<script lang="ts">
import { Getter, Mutation } from 'vuex-class';
import { Vue, Component, Watch } from 'vue-property-decorator';
import AccountsItem from './AccountsItem.vue';
import type { SelectedWallet, Wallet } from '@/store';
import type { Networks, TMutation } from '@/interfaces';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { Components } from '@/router/routes';
import { getChainAccounts } from '@/helpers/accounts';
import { ActionTypes as AccountsActionTypes } from '@/store/accounts/actions';

@Component({
  components: { AccountsItem },
})
export default class Account extends Vue {
  selectedNetwork = '';
  selectedAddress = '';
  newName = '';

  @Getter(NetworksGettersTypes.getAllNetworks) networks!: Networks;
  @Mutation(AccountsActionTypes.SET_SELECTED_WALLET) setSelectedWallet!: TMutation<string>;

  get accountName() {
    return this.$route.params.name;
  }

  get accountAddress(): Wallet {
    return {
      address: this.$route.params.address,
      ethereumAddress: this.$route.params.ethereumAddress,
      isMobile: !!this.$route.params.isMobile,
    };
  }

  get isMobileWallet() {
    return this.accountAddress.isMobile;
  }

  get chainAccounts() {
    return getChainAccounts(this.networks, this.accountAddress);
  }

  @Watch('selectedWallet')
  ethereumJsonChanged({ name }: SelectedWallet) {
    this.newName = name;
  }

  mounted() {
    this.newName = this.accountName;
  }

  back() {
    this.$router.push({ name: Components.Wallet });
  }

  openAccountSettingsPopup(network: string, event: Event) {
    this.$emit('openAccountSettingsPopup', network, event);
  }

  blurInputName() {
    const { address } = this.accountAddress;

    if (this.newName === '') {
      this.newName = this.accountName;

      return;
    }

    // BaseApi.updateWalletName(address, this.newName);

    this.setSelectedWallet(address);
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
