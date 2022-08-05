<template>
  <ConfirmationPopup
    text="Add Moonbeam and Moonriver accounts?"
    :handlerClose="handlerClose"
    :handlerAgree="handlerAgree"
  >
    <div class="ethereum-account-popup">
      <img src="@/assets/moonbeam-moonriver.svg" />

      <div class="header">ETH accounts</div>
    </div>
  </ConfirmationPopup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import ConfirmationPopup from '@/components/ConfirmationPopup.vue';

@Component({
  components: { ConfirmationPopup },
})
export default class AddEthereumAccountPopup extends Vue {
  @Prop(Function) handlerClose!: VoidFunction;
  @Prop(Function) handlerAgree!: VoidFunction;
}
</script>

<style lang="scss" scoped>
.ethereum-account-popup {
  .header {
    font-weight: 700;
    font-size: 18px;
    margin: 10px 0;
  }
}
</style>
