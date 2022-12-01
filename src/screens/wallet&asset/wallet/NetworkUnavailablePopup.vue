<template>
  <NotificationPopup
    class="network-unavailable-popup"
    sizeWidth="big"
    rejectButtonText="Cancel"
    acceptButtonText="accounts.switchNode"
    :showAcceptButton="true"
    :showRejectButton="true"
    :headers="headers"
    :handlerClose="closePopup"
    :handlerAccept="handlerAccept"
  />
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class NetworkUnavailablePopup extends Vue {
  @Prop(Function) closePopup!: VoidFunction;
  @Prop(Function) handlerAccept!: VoidFunction;

  get headers() {
    return { text: 'wallet.networkUnavailable', subtext: 'wallet.networkUnavailableSubtext' };
  }
}
</script>

<style lang="scss" scoped>
.network-unavailable-popup {
  z-index: 500 !important;
}
</style>
