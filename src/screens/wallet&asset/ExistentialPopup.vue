<template>
  <NotificationPopup
    sizeWidth="big"
    :headers="headers"
    :showAcceptButton="true"
    :showRejectButton="true"
    @handlerClose="$emit('handlerClose')"
    @handlerAccept="$emit('handlerAccept')"
  />
</template>

<script lang="ts" setup>
const headers = {
  text: 'assets.existentialDepositText',
  subtext: 'assets.existentialDepositSubtext',
};
</script>
