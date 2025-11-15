<template>
  <NotificationPopup
    acceptButtonText="assets.changeAddress"
    rejectButtonText="common.cancel"
    sizeWidth="big"
    :showHeader="false"
    :showAcceptButton="true"
    :showRejectButton="true"
    :closeByBackground="false"
    :headers="headers"
    @handlerClose="handleClose"
    @handlerAccept="handleAccept"
  />
</template>

<script lang="ts" setup>
const headers = {
  text: 'assets.invalidNetworkText',
  subtext: 'assets.invalidNetworkSubtext',
};

const emit = defineEmits<{
  handlerClose: [];
  handlerAccept: [];
}>();

const handleClose = () => emit('handlerClose');
const handleAccept = () => emit('handlerAccept');
</script>
