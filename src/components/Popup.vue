<template>
  <div class="popup-background">
    <div class="popup-content">
      <div class="header">
        <div class="button"></div>
        <div class="header-text">{{ header }}</div>
        <s-button type="link" class="button" @click="handlerClose">
          <s-icon name="basic-close-24" />
        </s-button>
      </div>

      <slot></slot>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component({ components: {} })
export default class extends Vue {
  @Prop(Function) handlerClose!: () => void;
  @Prop({ default: '' }) header!: string;
}
</script>

<style lang="scss" scoped>
.popup-background {
  display: flex;
  justify-content: center;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 100;
  background-color: rgba(0, 0, 0, 0.6);

  .popup-content {
    display: flex;
    align-items: center;
    flex-direction: column;
    margin: auto;
    min-height: 100px;
    min-width: 300px;
    max-height: 600px;
    max-width: 500px;
    clip-path: polygon(20px 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%, 0 20px);
    background-color: #111111;
    border-radius: 8px;
    padding: 20px 20px 30px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    height: 25px;
    margin-bottom: 15px;
  }

  .header-text {
    font-weight: 700;
    font-size: 18px;
    color: rgba(255, 255, 255, 0.75);
  }

  .s-icon-basic-close-24 {
    color: rgba(255, 255, 255, 0.65);
  }

  .button {
    padding: 0;
    width: 20px;
  }
}
</style>
