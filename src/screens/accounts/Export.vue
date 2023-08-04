<template>
  <div class="export">
    <div class="description">
      <div class="header">{{ $t('accounts.exportJson') }}</div>

      <InformationBlock class="information" :text="warningText" />
    </div>

    <div>
      <ValidatedInput
        v-model="password"
        errorDescriptions="common.invalidPassword"
        placeholder="accounts.passwordWallet"
        :isError="isWrongPassword"
        :showPassword="true"
        :readonly="noEthereumAccount"
      />

      <Button
        class="want-export"
        size="big"
        fontSize="big"
        width="100%"
        text="accounts.wantExportJson"
        :disabled="noEthereumAccount"
        @click="checkPassword"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { Vue, Component, Watch } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { SelectedWallet } from '@/store';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { ETHEREUM_NETWORKS } from '@/consts/networks';
import { validatePassword } from '@/extension/messaging';

@Component
export default class Export extends Vue {
  password = '';
  isWrongPassword = false;

  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;

  get network() {
    return this.$route.params.network;
  }

  get noEthereumAccount() {
    return this.selectedWallet.ethereumAddress === '' && ETHEREUM_NETWORKS.includes(this.network);
  }

  get warningText() {
    return this.noEthereumAccount ? 'accounts.notEthereumAccount' : 'accounts.exportWarning';
  }

  @Watch('password')
  filter() {
    this.isWrongPassword = false;
  }

  async checkPassword() {
    const addressByNetwork = BaseApi.formatAddress(this.selectedWallet, this.network);
    const validatePass = await validatePassword(addressByNetwork, this.password);

    this.isWrongPassword = !validatePass;

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
  height: 100%;

  .information {
    margin-top: 25px;
  }

  .want-export {
    margin: 16px 0;
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
