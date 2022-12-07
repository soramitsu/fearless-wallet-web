<template>
  <NotificationPopup
    sizeWidth="big"
    rejectButtonText="Cancel"
    acceptButtonText="accounts.switchNode"
    :showRejectButton="true"
    :headers="headers"
    :handlerClose="closePopup"
    :zIndex="500"
  />
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class NetworkUnavailablePopup extends Vue {
  @Prop(Function) closePopup!: VoidFunction;

  get headers() {
    return { text: 'wallet.networkUnavailable', subtext: 'wallet.networkUnavailableSubtext' };
  }
}
</script>
