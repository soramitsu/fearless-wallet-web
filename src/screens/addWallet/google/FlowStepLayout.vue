<template>
  <div class="add-wallet">
    <div class="header">
      <div class="icon-container">
        <CircleButton
          v-if="showBackButton"
          backgroundColor="light-black"
          iconName="chevron-left"
          data-testid="backBtn"
          @click="back"
        />
      </div>

      <div class="steps" data-testid="googleWalletProgress">
        <div
          v-for="progressStep in progressState.steps"
          :key="progressStep.number"
          class="circle-step"
          :class="{ 'circle-filled': progressStep.filled }"
          :data-step="progressStep.number"
        ></div>
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

        <div v-if="isLoading" class="loader__container">
          <Loader />
        </div>

        <div v-else-if="!isFinishStep" class="step__content">
          <slot></slot>
        </div>

        <FinishForm v-else />
      </div>

      <div class="controls">
        <slot name="control"></slot>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import FinishForm from '@/screens/addWallet/FinishForm.vue';
import { getGoogleWalletProgressState } from '@/helpers/googleWalletProgress';

export default defineComponent({
  name: 'FlowStepLayout',
  components: { FinishForm },
  props: {
    countSteps: { required: true, type: Number },
    step: { required: true, type: Number },
    isLoading: { default: false, type: Boolean },
    header: String,
    showFullScreenIcon: { default: false },
    showAdvancedForm: { default: false },
  },
  computed: {
    progressState() {
      return getGoogleWalletProgressState(this.countSteps, this.step);
    },
    isFinishStep() {
      return this.progressState.isFinishStep;
    },
    showBackButton() {
      return this.progressState.isValid && !this.showAdvancedForm && !this.isFinishStep;
    },
  },
  methods: {
    back() {
      this.$emit('back');
    },
    fullScreen() {
      this.$emit('openFullScreen');
    },
  },
});
</script>

<style lang="scss" scoped>
.step__content {
  height: 100%;
  width: 100%;
  display: flex;
  justify-content: center;
}

.loader__container {
  display: flex;
  align-items: center;
  justify-content: center;
  height: calc(100% - 60px);
}

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
      height: 100%;

      .selected-network {
        margin-bottom: 16px;
      }
    }

    .content-header {
      font-weight: 600;
      font-size: 1.25rem;
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
  }
}
</style>
