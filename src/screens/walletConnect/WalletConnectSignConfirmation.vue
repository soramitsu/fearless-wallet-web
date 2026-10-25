<template>
  <Transaction
    wallet-connect
    :approve-wallet-connect="walletConnectRequestApprove"
    :reject-wallet-connect="walletConnectRequestReject"
  />
</template>
<script setup lang="ts">
import Transaction from '@/screens/extension-ui/signing/Transaction.vue';
import { walletConnectRequestApprove, walletConnectRequestReject } from '@/extension/messaging';
</script>
