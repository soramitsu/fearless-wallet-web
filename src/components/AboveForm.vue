<template>
  <!-- Black form with company logo (selection derivation path on layouts) -->
  <!-- TODO: Maybe rename the title to something more descriptive -->
  <div class="above-form">
    <div class="header-content">
      <div class="logo">
        <img src="@/assets/fw-logo.svg" />
      </div>
      <div class="header">{{ header }}</div>
      <div class="activity-block">
        <div class="icon" @click="closeHandler">
          <s-icon name="basic-close-24" />
        </div>
        <div v-show="showAcceptIcon" class="icon" @click="saveChanges">
          <s-icon name="basic-check-mark-24" />
        </div>
      </div>
    </div>
    <div class="content">
      <slot></slot>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class extends Vue {
  @Prop({ default: '' }) header!: string;
  @Prop({ default: false }) showAcceptIcon!: boolean;
  @Prop({ default: () => () => null }) saveChanges!: VoidFunction;
  @Prop(Function) closeHandler!: VoidFunction;
}
</script>

<style lang="scss" scoped>
.above-form {
  border-radius: var(--default-border-radius);
  height: 560px;
  width: 560px;
  z-index: 299;
  margin-left: -16px;
  background-color: #111111;
  clip-path: polygon(100% 0, 100% 100%, 0 100%, 0 4%, 4% 0);
  animation: ani 0.3s;

  @keyframes ani {
    0% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }

  .content {
    height: 496px;
    padding: 16px;
  }

  .s-icon-basic-close-24 {
    // font-size: 20px !important;
    font-weight: 400;
    opacity: 0.8;
    color: rgba(255, 255, 255, 0.65);

    &:hover {
      cursor: pointer;
      opacity: 1;
    }
  }

  .s-icon-basic-check-mark-24 {
    // font-size: 20px !important;
    color: rgba(255, 255, 255, 0.5);
    font-weight: 400;
    color: var(--pink-lavender-color);
    opacity: 0.8;

    &:hover {
      cursor: pointer;
      opacity: 1;
    }
  }

  .header-content {
    height: 64px;
    font-size: 24px;
    display: flex;
    justify-content: space-between;
    padding: 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .logo {
    margin-left: 5px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .header {
    font-size: 18px;
    font-weight: 700;
    margin: auto 0;
  }

  .activity-block {
    display: flex;
    justify-content: right;
    width: 10px;
  }

  .icon {
    display: flex;
    flex-direction: column;
    justify-content: center;

    &:last-child {
      margin-left: 15px;
    }
  }
}
</style>
