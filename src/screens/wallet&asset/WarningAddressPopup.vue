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
    @handlerClose="$emit('handlerClose')"
    @handlerAccept="$emit('handlerAccept')"
  />
</template>

<script lang="ts" setup>
const headers = {
  text: 'assets.invalidNetworkText',
  subtext: 'assets.invalidNetworkSubtext',
};
</script>
