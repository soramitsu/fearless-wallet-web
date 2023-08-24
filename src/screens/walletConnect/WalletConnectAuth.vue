<template>
  <Fragment>
    <FButton text="walletConnect.approve" @click="onApprove" />
    <FButton text="walletConnect.reject" @click="onReject" />
  </Fragment>
</template>

<script setup lang="ts">
import { WalletConnectRequestProps } from './types';
import {
  approveWalletConnectSession,
  approveWalletConnectNotSupport,
  rejectWalletConnectSession,
  rejectWalletConnectNotSupport,
} from '@/extension/messaging';

const { id, isSupported } = defineProps({
  id: { type: String, required: true },
  isSupported: Boolean,
}) as WalletConnectRequestProps;

const onApprove = () => {
  isSupported ? approveWalletConnectSession({ accounts: [''], id }) : approveWalletConnectNotSupport({ id });
};

const onReject = () => {
  isSupported ? rejectWalletConnectSession({ id }) : rejectWalletConnectNotSupport({ id });
};
</script>
