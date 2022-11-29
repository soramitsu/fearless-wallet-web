<template>
  <div class="add-wallet">
    <div class="header">
      <div class="icon-container">
        <CircleButton v-if="notFinish" backgroundColor="light-black" iconName="chevron-left" @click="back" />
      </div>

      <div class="steps">
        <div v-for="num in countSteps" :key="num" :class="getClasses(num)"></div>
      </div>

      <div class="icon-background">
        <CircleButton
          v-if="showFullScreenIcon"
          iconName="expand"
          backgroundColor="light-black"
          tooltipText="common.fullScreen"
          target=".expand"
          placement="left"
          @click="fullScreen"
        />
      </div>
    </div>

    <div class="content-wrapper">
      <div class="content">
        <div class="content-header">{{ header }}</div>
      </div>
      <slot v-if="notFinish"></slot>

      <FinishForm v-else />
      <div class="controls">
        <slot name="control"></slot>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import Checkbox from '@/components/Checkbox.vue';
import Input from '@/components/Input.vue';
import Scroll from '@/components/Scroll.vue';
import FinishForm from '@/screens/addWallet/FinishForm.vue';
import CircleButton from '@/components/CircleButton.vue';

@Component({
  components: {
    Scroll,
    Input,
    FinishForm,
    CircleButton,
    Checkbox,
  },
})
export default class FlowStepLayout extends Vue {
  @Prop(Number) countSteps!: number;
  @Prop(Number) step!: number;
  @Prop(String) header!: string;
  @Prop({ default: false }) showFullScreenIcon!: boolean;

  back() {
    this.$emit('back');
  }

  fullScreen() {
    this.$emit('openFullScreen');
  }

  get notFinish() {
    return this.countSteps !== this.step;
  }

  getClasses(num: number) {
    //TODO it maybe broken
    const isCircleHidden = this.step >= this.countSteps;
    const isCircleFilled = !isCircleHidden && num <= this.step;

    return [
      'circle-step',
      {
        'circle-filled': isCircleFilled,
        'circle-hidden': isCircleHidden,
      },
    ];
  }
}
</script>

<style lang="scss" scoped>
.add-wallet {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;

  .header {
    width: 100%;
    margin-bottom: 24px;
    display: flex;
    justify-content: space-between;

    .steps {
      display: flex;
      align-items: center;

      .circle-step {
        border-radius: 50%;
        width: 10px;
        height: 10px;
        background-color: $default-background-color;
        margin-right: 8px;
      }

      .circle-filled {
        background-color: $pink-color;
      }

      .circle-hidden {
        display: none;
      }
    }
  }

  .content-wrapper {
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;

    .content {
      width: 100%;

      .selected-network {
        margin-bottom: 16px;
      }
    }

    .content-header {
      font-weight: 600;
      font-size: 20px;
      line-height: 25px;
      margin: 13.5px 0 21.5px;
    }
  }

  .el-button.s-primary:disabled {
    background-color: rgba(238, 0, 119, 0.4);
    border: rgba(238, 0, 119, 0.4);
    color: $gray-color;
  }

  .icon-container {
    width: 32px;
    height: 32px;
  }

  .controls {
    width: 100%;
    margin-bottom: 15px;
  }
}
</style>
