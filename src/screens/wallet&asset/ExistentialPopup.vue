<template>
  <NotificationPopup
    sizeWidth="big"
    :headers="headers"
    :showAcceptButton="true"
    :showRejectButton="true"
    @handlerClose="handleClose"
    @handlerAccept="handleAccept"
  />
</template>

<script lang="ts" setup>
const headers = {
  text: 'assets.existentialDepositText',
  subtext: 'assets.existentialDepositSubtext',
};

const emit = defineEmits<{
  handlerClose: [];
  handlerAccept: [];
}>();

const handleClose = () => emit('handlerClose');
const handleAccept = () => emit('handlerAccept');
</script>
