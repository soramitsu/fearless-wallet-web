<template>
  <div class="popup-background">
    <div class="popup-container">
      <div class="header">
        <div class="button"></div>
        <div class="header-text">{{ header }}</div>
        <s-button type="link" class="button" @click="handlerClose">
          <s-icon name="basic-close-24" />
        </s-button>
      </div>

      <div class="content">
        <slot></slot>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class extends Vue {
  @Prop(Function) handlerClose!: VoidFunction;
  @Prop({ default: '' }) header!: string;
}
</script>

<style lang="scss" scoped>
.popup-background {
  height: var(--extension-height);
  width: var(--extension-width);
  border-radius: var(--default-border-radius);
  display: flex;
  justify-content: center;
  position: absolute;
  top: 0;
  margin-left: -16px;
  background-color: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(5px);
  z-index: 99;

  .popup-container {
    display: flex;
    align-items: center;
    flex-direction: column;
    margin: auto;
    min-height: 100px;
    min-width: 380px;
    max-height: 390px;
    max-width: 480px;
    background-color: #111111;
    clip-path: var(--default-clip-path);
    border-radius: var(--default-border-radius);
    padding: 20px 0 30px;

    ::-webkit-scrollbar {
      width: 4px;
    }

    ::-webkit-scrollbar-thumb {
      background-color: rgba(255, 255, 255, 0.25);
      border-radius: var(--default-border-radius);

      &:hover {
        background-color: rgba(255, 255, 255, 0.15);
      }
    }
  }

  .content {
    width: 100%;
    height: 100%;
    overflow: scroll;
    overflow-x: hidden;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    height: 25px;
    margin-bottom: 15px;
    padding-left: 16px;
    padding-right: 22px;
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
