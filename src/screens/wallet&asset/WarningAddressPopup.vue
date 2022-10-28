<template>
  <NotificationPopup
    acceptButtonText="Change address"
    rejectButtonText="Switch to a correct network"
    sizeWidth="big"
    :showHeader="false"
    :showAcceptButton="true"
    :showRejectButton="true"
    :closeBuBackground="false"
    :headers="headers"
    :handlerClose="handlerClose"
    :handlerAccept="handlerAcceptButton"
  />
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import NotificationPopup from '@/components/NotificationPopup.vue';
import { IS_NOT_NETWORK_ADDRESS } from '@/consts/messages';

@Component({
  components: { NotificationPopup },
})
export default class WarningAddressPopup extends Vue {
  readonly headers = {
    text: 'Is not network address',
    subtext: IS_NOT_NETWORK_ADDRESS,
  };

  @Prop(Function) handlerClose!: VoidFunction;
  @Prop(Function) handlerAcceptButton!: VoidFunction;
}
</script>

<style lang="scss" scoped>
.existential-popup {
  z-index: 399;
}
</style>
