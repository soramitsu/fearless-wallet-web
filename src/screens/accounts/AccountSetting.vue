<template>
  <div class="accounts">
    <FInput
      :value="newName"
      placeholder="accounts.walletName"
      size="big"
      data-testid="walletNameAccounts"
      :maxlength="35"
      @blur="blurInputName"
      @change="changeNewName"
    />

    <InfoRow
      v-for="{ name, count, type } in relayChains"
      data-testid="chainAccounts"
      :text="`${name} ${$t('accounts.chainAccounts')}`"
      :value="count"
      :hideLastBorder="false"
      :hoverIconValue="true"
      :isHoverRow="true"
      :key="count"
      iconValue="chevron-right"
      @click="openChainAccounts(type)"
    />
  </div>
</template>

<script lang="ts">
import { Vue, Component, Watch } from 'vue-property-decorator';
import { Components } from '@/router/routes';
import { accountUpdateName } from '@/extension/messaging';
import { getChainAccounts } from '@/helpers/accounts';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { type SelectedWallet } from '@/stores';
import { isSameString } from '@/helpers';

@Component({})
export default class AccountSetting extends Vue {
  networksStore = useNetworksStore();
  accountsStore = useAccountsStore();
  selectedNetwork = '';
  selectedAddress = '';
  newName = '';

  get chainAccounts() {
    return getChainAccounts(this.networksStore.networks, this.accountsStore.selectedWallet);
  }

  get relayChains() {
    const counterEVM = this.networksStore.networks.filter(({ ecosystem }) =>
      isSameString(ecosystem, 'ethereum')
    ).length;

    const counterSubstrate = this.networksStore.networks.filter(
      ({ ecosystem }) => isSameString(ecosystem, 'substrate') || isSameString(ecosystem, 'ethereumBased')
    ).length;

    const counterTon = this.networksStore.networks.filter(({ ecosystem }) => isSameString(ecosystem, 'ton')).length;

    if (this.accountsStore.selectedWallet.isTon) {
      return [
        {
          name: 'TON',
          count: counterTon.toString(),
          type: 'ton',
        },
      ];
    }

    return [
      {
        name: 'EVM',
        count: counterEVM.toString(),
        type: 'evm',
      },
      {
        name: 'Substrate',
        count: counterSubstrate.toString(),
        type: 'substrate',
      },
    ];
  }

  @Watch('selectedWallet')
  selectedWalletWatcher({ name }: SelectedWallet) {
    this.newName = name;
  }

  mounted() {
    this.newName = this.accountsStore.selectedWallet.name;
  }

  back() {
    this.$router.push({ name: Components.Wallet });
  }

  changeNewName(value: string) {
    this.newName = value;
  }

  blurInputName() {
    const { address, name } = this.accountsStore.selectedWallet;

    if (this.newName === '') {
      this.newName = name;

      return;
    }

    accountUpdateName(address, this.newName, this.accountsStore.selectedWallet.walletEcosystem!);
  }

  openChainAccounts(type: string) {
    this.$router.push({
      name: Components.ChainAccounts,
      params: {
        type,
      },
    });
  }
}
</script>

<style lang="scss" scoped>
.accounts {
  display: flex;
  flex-direction: column;

  .dots {
    margin: auto;
    height: 20px;
    width: 20px;
  }
}
</style>
