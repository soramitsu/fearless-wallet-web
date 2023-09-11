<template>
  <Popup
    headerText="common.sourceType"
    sizeWidth="big"
    :showBorder="true"
    :showAnimation="false"
    @handlerClose="$emit('handlerClose')"
  >
    <div class="add-ethereum-account">
      <BorderButton
        borderRadius="mini"
        text="accounts.createNewAccount"
        class="button"
        @click="openAddWalletPage('create')"
      />

      <BorderButton
        borderRadius="mini"
        text="common.alreadyHaveAccount"
        class="button"
        @click="openAddWalletPage('import')"
      />

      <BorderButton borderRadius="mini" text="accounts.dontNeedAccount" class="button" @click="$emit('handlerClose')" />
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Components } from '@/router/routes';

@Component
export default class AddEthereumAccountPopup extends Vue {
  openAddWalletPage(type: string) {
    this.$router.push({
      name: Components.AddWallet,
      params: {
        type,
        onlyEthereumAccount: '',
      },
    });
  }
}
</script>

<style lang="scss" scoped>
.add-ethereum-account {
  padding: 0 16px;

  .button {
    margin-top: 10px;
  }
}
</style>
