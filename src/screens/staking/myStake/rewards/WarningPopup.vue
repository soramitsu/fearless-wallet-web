<template>
  <NotificationPopup
    acceptButtonText="common.proceed"
    rejectButtonText="common.cancel"
    sizeWidth="big"
    :showAcceptButton="true"
    :showRejectButton="true"
    :closeByBackground="false"
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
    text: 'common.areYouSure',
    subtext: 'staking.rewardLess',
  };

  @Prop(Function) handlerClose!: VoidFunction;
  @Prop(Function) handlerAccept!: VoidFunction;
}
</script>
