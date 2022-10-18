<template>
  <NotificationPopup
    class="existential-popup"
    sizeWidth="big"
    rejectButtonText="Cancel"
    acceptButtonText="Proceed"
    :headers="headers"
    :showAcceptButton="true"
    :showRejectButton="true"
    :handlerClose="handlerClose"
    :handlerAcceptButton="handlerAcceptButton"
  />
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import NotificationPopup from '@/components/NotificationPopup.vue';
import { EXISTENTIAL_DEPOSIT_WARNING } from '@/consts/messages';

@Component({
  components: {
    NotificationPopup,
  },
})
export default class ExistentialPopup extends Vue {
  readonly headers = {
    text: 'Operation will remove account',
    subtext: EXISTENTIAL_DEPOSIT_WARNING,
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
