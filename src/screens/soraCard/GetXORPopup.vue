<template>
  <Popup headerText="soraCard.getXOR" sizeWidth="big" :showBorder="true" :handlerClose="handlerClose">
    <div class="content">
      <div>{{ $t('soraCard.getXORLabel') }}</div>

      <Button width="100%" text="soraCard.buyXORWithEUR" class="button" @click="buyXORwithEUR" />

      <Button width="100%" text="soraCard.swapXOR" class="button" @click="openSoraSwap" />

      <BorderButton width="100%" text="common.cancel" class="button" @click="handlerClose" />
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Components } from '@/router/routes';

@Component
export default class GetXORPopup extends Vue {
  @Prop(String) leftXORAmount!: string;
  @Prop(Function) handlerClose!: VoidFunction;

  // TODO mock
  buyXORwithEUR() {
    alert('buyXORWithEUR');
  }

  openSoraSwap() {
    this.$router.push({
      name: Components.SoraSwap,
      params: {
        leftXORAmount: this.leftXORAmount,
      },
    });
  }
}
</script>

<style scoped lang="scss">
.content {
  padding: 5px 16px 0px;
  color: $gray-color;

  .proceed-button {
    margin: 20px 0 10px;
  }

  .button {
    margin-top: 10px;
  }
}
</style>
