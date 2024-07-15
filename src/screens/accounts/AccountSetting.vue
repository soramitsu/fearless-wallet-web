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
import { Getter } from 'vuex-class';
import { Vue, Component, Watch } from 'vue-property-decorator';
import type { SelectedWallet } from '@/store';
import type { Networks } from '@/interfaces';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { Components } from '@/router/routes';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { accountUpdateName } from '@/extension/messaging';
import { getChainAccounts } from '@/helpers/accounts';
import { isNativeEVMNetwork } from '@/extension/background/extension-base/src/background/utils/utils';

@Component({})
export default class AccountSetting extends Vue {
  selectedNetwork = '';
  selectedAddress = '';
  newName = '';

  @Getter(NetworksGettersTypes.allNetworks) networks!: Networks;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;

  get chainAccounts() {
    return getChainAccounts(this.networks, this.selectedWallet);
  }

  get relayChains() {
    const counterEVM = this.networks.filter(({ name }) => isNativeEVMNetwork(name)).length;
    const counterSubstrate = this.networks.filter(({ name }) => !isNativeEVMNetwork(name)).length;

    return [
      { name: 'EVM', count: counterEVM.toString(), type: 'evm' },
      { name: 'Substrate', count: counterSubstrate.toString(), type: 'substrate' },
    ];
  }

  @Watch('selectedWallet')
  selectedWalletWatcher({ name }: SelectedWallet) {
    this.newName = name;
  }

  mounted() {
    this.newName = this.selectedWallet.name;
  }

  back() {
    this.$router.push({ name: Components.Wallet });
  }

  changeNewName(value: string) {
    this.newName = value;
  }

  blurInputName() {
    const { address, name } = this.selectedWallet;

    if (this.newName === '') {
      this.newName = name;

      return;
    }

    accountUpdateName(address, this.newName);
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
