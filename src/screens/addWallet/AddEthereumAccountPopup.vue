<template>
  <ConfirmationPopup
    text="accounts.addEthereumAccounts"
    @handlerClose="$emit('handlerClose')"
    @handlerAgree="$emit('handlerAgree')"
  >
    <div class="ethereum-account-popup">
      <Icon icon="moonbeam-moonriver" class="moonbeam-moonriver" />

      <div class="header">ETH {{ $t('addWallet.accounts') }}</div>
    </div>
  </ConfirmationPopup>
</template>

<script lang="ts" setup></script>

<style lang="scss" scoped>
.ethereum-account-popup {
  .header {
    font-weight: 700;
    font-size: 1.125em;
    margin: 10px 0;
  }

  .moonbeam-moonriver {
    height: 70px;
  }
}
</style>
