<template>
  <Popup headerText="soraCard.getXOR" sizeWidth="big" :showBorder="true" :handlerClose="handlerClose">
    <div class="content">
      <div>{{ $t('soraCard.getXORLabel') }}</div>

      <Button width="100%" text="soraCard.buyXORWithEUR" class="button" @click="buyXORwithEUR" />

      <Button width="100%" text="soraCard.swapXOR" class="button" @click="swapXOR" />

      <BorderButton width="100%" text="common.cancel" class="button" @click="handlerClose" />
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class GetXORPopup extends Vue {
  @Prop(Function) handlerClose!: VoidFunction;

  buyXORwithEUR() {
    alert('buyXORWithEUR');
  }

  swapXOR() {
    alert('swapXOR');
  }
}
</script>

<style scoped lang="scss">
.content {
  padding: 16px;
  color: $gray-color;

  .proceed-button {
    margin: 20px 0 10px;
  }

  .button {
    margin-top: 10px;
  }
}
</style>
