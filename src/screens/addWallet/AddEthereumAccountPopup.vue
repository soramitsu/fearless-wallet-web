<template>
  <ConfirmationPopup text="accounts.addEthereumAccounts" :handlerClose="handlerClose" :handlerAgree="handlerAgree">
    <div class="ethereum-account-popup">
      <Icon icon="moonbeam-moonriver" class="moonbeam-moonriver" />

      <div class="header">ETH {{ $t('addWallet.accounts') }}</div>
    </div>
  </ConfirmationPopup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class AddEthereumAccountPopup extends Vue {
  @Prop(Function) handlerClose!: VoidFunction;
  @Prop(Function) handlerAgree!: VoidFunction;
}
</script>

<style lang="scss" scoped>
.ethereum-account-popup {
  .header {
    font-weight: 700;
    font-size: 18px;
    margin: 10px 0;
  }

  .moonbeam-moonriver {
    height: 70px;
  }
}
</style>
