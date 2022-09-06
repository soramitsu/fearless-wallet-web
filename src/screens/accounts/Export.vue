<template>
  <div class="export">
    <div class="description">
      <div class="header">Export JSON</div>
      <InformationBlock
        class="information"
        text="Sharing or copying your secret is a high risk operation, don’t send it to anyone. Would you like to proceed with sharing/copying process?"
      />
    </div>

    <div>
      <ValidatedInput
        v-model="password"
        errorDescriptions="Incorrect password"
        placeholder="Password for this wallet"
        :isError="isWrongPassword"
        :showPassword="true"
        :maxlength="25"
      />

      <Button
        class="want-export"
        size="big"
        fontSize="big"
        width="100%"
        text="I want to export JSON"
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

  @Watch('password')
  filter() {
    this.isWrongPassword = false;
  }

  checkPassword() {
    const addressByNetwork = BaseApi.getDefaultAddressByNetworkIncludingReplacedAccount(
      this.selectedWallet,
      this.network
    );

    try {
      BaseApi.unlockPair(addressByNetwork, this.password);
    } catch (ex) {
      this.isWrongPassword = true;

      return;
    }

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
