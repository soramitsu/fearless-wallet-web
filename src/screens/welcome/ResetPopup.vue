<template>
  <NotificationPopup
    sizeWidth="big"
    rejectButtonText="Cancel"
    acceptButtonText="welcome.resetWallet"
    :showAcceptButton="true"
    :showRejectButton="true"
    :showWarningIcon="true"
    :headers="headers"
    @handlerClose="closeNotificationPopup"
    @handlerAccept="handlerAccept"
  />
</template>

<script lang="ts" setup>
import { useRouter } from 'vue-router';
import { Components } from '@/router/routes';

const emit = defineEmits(['close']);

const headers = { text: 'welcome.forgotYourPassword', subtext: 'welcome.resetWarning' };
const router = useRouter();

const handlerAccept = () => router.push({ name: Components.ResetWallet });

const closeNotificationPopup = () => emit('close');
</script>
