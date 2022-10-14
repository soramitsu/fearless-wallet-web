<template>
  <div class="export">
    <div class="description">
      <div class="header">Export JSON</div>

      <InformationBlock class="information" :text="warningText" />
    </div>

    <div>
      <ValidatedInput
        v-model="password"
        errorDescriptions="Incorrect password"
        placeholder="Password for this wallet"
        :isError="isWrongPassword"
        :showPassword="true"
        :maxlength="25"
        :readonly="noEthereumAccount"
      />

      <Button
        class="want-export"
        size="big"
        fontSize="big"
        width="100%"
        text="I want to export JSON"
        :disabled="noEthereumAccount"
        @click="checkPassword"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { Vue, Component, Watch } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { SelectedWallet } from '@/store/accounts/types';
import Button from '@/components/Button.vue';
import ValidatedInput from '@/components/ValidatedInput.vue';
import InformationBlock from '@/components/InformationBlock.vue';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { EXPORT_WARNING, EXPORT_ETHEREUM_WALLET_ERROR } from '@/consts/messages';
import { ETHEREUM_NETWORKS } from '@/consts/networks';

@Component({
  components: {
    Button,
    ValidatedInput,
    InformationBlock,
  },
})
export default class Export extends Vue {
  password = '';
  isWrongPassword = false;

  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  get network() {
    return this.$route.params.network;
  }

  get noEthereumAccount() {
    return this.selectedWallet.ethereumAddress === '' && ETHEREUM_NETWORKS.includes(this.network);
  }

  get warningText() {
    return this.noEthereumAccount ? EXPORT_ETHEREUM_WALLET_ERROR : EXPORT_WARNING;
  }

  @Watch('password')
  filter() {
    this.isWrongPassword = false;
  }

  checkPassword() {
    const addressByNetwork = BaseApi.getDefaultAddressByNetworkIncludingReplacedAccount(
      this.selectedWallet,
      this.network
    );

    this.isWrongPassword = !BaseApi.unlockPair(addressByNetwork, this.password);

    if (this.isWrongPassword) return;

    this.$emit('setPassword', this.password);
  }
}
</script>

<style lang="scss" scoped>
.export {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  margin-right: 16px;
  margin-bottom: 16px;
  height: calc(100% - 16px);

  .information {
    margin-top: 25px;
  }

  .want-export {
    margin-top: 16px;
  }

  .description {
    display: flex;
    flex-direction: column;
    align-items: flex-start;

    .header {
      font-weight: 800;
      font-size: 22px;
    }
  }
}
</style>
