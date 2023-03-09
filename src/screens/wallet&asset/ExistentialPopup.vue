<template>
  <NotificationPopup
    sizeWidth="big"
    :headers="headers"
    :showAcceptButton="true"
    :showRejectButton="true"
    :handlerClose="handlerClose"
    :handlerAccept="handlerAccept"
  />
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class ExistentialPopup extends Vue {
  readonly headers = {
    text: 'assets.existentialDepositText',
    subtext: 'assets.existentialDepositSubtext',
  };

  @Prop(Function) handlerClose!: VoidFunction;
  @Prop(Function) handlerAccept!: VoidFunction;
}
</script>
