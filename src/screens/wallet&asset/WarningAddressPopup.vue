<template>
  <NotificationPopup
    acceptButtonText="asset.changeAddress"
    rejectButtonText="asset.switchNetwork"
    sizeWidth="big"
    :showHeader="false"
    :showAcceptButton="true"
    :showRejectButton="true"
    :closeBuBackground="false"
    :headers="headers"
    :handlerClose="handlerClose"
    :handlerAccept="handlerAccept"
  />
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class WarningAddressPopup extends Vue {
  readonly headers = {
    text: 'asset.invalidNetworkText',
    subtext: 'asset.invalidNetworkSubtext',
  };

  @Prop(Function) handlerClose!: VoidFunction;
  @Prop(Function) handlerAccept!: VoidFunction;
}
</script>
