<template>
  <ConfirmationPopup text="accounts.addEthereumAccounts" @handlerClose="handleClose" @handlerAgree="handleAgree">
    <div class="ethereum-account-popup">
      <Icon icon="moonbeam-moonriver" class="moonbeam-moonriver" />

      <div class="header">ETH {{ $t('addWallet.accounts') }}</div>
    </div>
  </ConfirmationPopup>
</template>

<script lang="ts" setup>
const emit = defineEmits<{
  handlerClose: [];
  handlerAgree: [];
}>();

const handleClose = () => emit('handlerClose');
const handleAgree = () => emit('handlerAgree');
</script>

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
