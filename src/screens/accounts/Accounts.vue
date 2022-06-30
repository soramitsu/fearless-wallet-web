<template>
  <div class="accounts">
    <Input v-model="selectedWallet.name" placeholder="Wallet name" size="big" :readonly="true" class="row" />

    <template v-if="showUniqueSecretsBlock">
      <div class="row label">Accounts with unique secrets</div>
    </template>

    <template v-if="showSharedSecretBlock">
      <div class="row label">Default accounts with a shared secret</div>

      <AccountsItem
        v-for="{ name, token, address } in accountsItems"
        :key="name"
        :name="name"
        :token="token"
        :address="address"
        @toggleAccountSettingsVisible="$emit('toggleAccountSettingsVisible', name, address)"
      />
    </template>
  </div>
</template>

<script lang="ts">
import { Vue, Component } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { SelectedWallet } from '@/store/accounts/types';
import { Networks } from '@/store/networks/types';
import { Components } from '@/router/routes';
import { getImgPathByNetworkName } from '@/util/imgPath';
import ContentForm from '@/components/ContentForm.vue';
import Input from '@/components/Input.vue';
import NetworksController from '@/controllers/networksController';
import CircleButton from '@/components/CircleButton.vue';
import Scroll from '@/components/Scroll.vue';
import AccountSettingsPopup from './AccountSettingsPopup.vue';
import AccountsItem from './AccountsItem.vue';

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

  get showUniqueSecretsBlock() {
    return false;
  }

  get showSharedSecretBlock() {
    return this.accountsItems.length > 0;
  }

  get accountsItems() {
    if (this.selectedWallet.address === '') return [];

    return this.networks.map(({ name, assets }) => {
      const address = NetworksController.formatAddress(this.selectedWallet, name);

      return {
        name,
        token: assets[0].assetId,
        address,
      };
    });
  }

  getImg(network: string) {
    if (network === '') return '';

    return require(`@/assets/networks/${getImgPathByNetworkName(network)}`);
  }

  getUpperValue(string: string) {
    return string.toUpperCase();
  }

  back() {
    this.$router.push({ name: Components.Wallet });
  }
}
</script>

<style lang="scss" scoped>
.accounts {
  display: flex;
  flex-direction: column;

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
