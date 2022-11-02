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
import NotificationPopup from '@/components/NotificationPopup.vue';

@Component({
  components: { NotificationPopup },
})
export default class ExistentialPopup extends Vue {
  readonly headers = {
    text: 'asset.existentialDepositText',
    subtext: 'asset.existentialDepositSubtext',
  };

  @Prop(Function) handlerClose!: VoidFunction;
  @Prop(Function) handlerAccept!: VoidFunction;
}
</script>
