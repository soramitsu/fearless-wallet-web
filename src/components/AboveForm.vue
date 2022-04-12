<template>
  <!-- Черная форма с логотипом компании(выбор derivation path на макетах) -->
  <!-- TODO: Возможно стоит переименовать название во что-то более описательное -->
  <div class="above-form">
    <div class="header-content">
      <div class="logo">
        <img src="../assets/fw-logo.svg" />
      </div>
      <div>{{ header }}</div>
      <div class="active-block">
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

@Component({})
export default class extends Vue {
  @Prop({ default: '' }) header!: string;
  @Prop({ default: false }) showAcceptIcon!: boolean;
  @Prop({ default: () => undefined }) saveChanges!: () => void;
  @Prop(Function) closeHandler!: () => void;
}
</script>

<style lang="scss" scoped>
.above-form {
  height: 560px;
  width: 100%;
  background-color: #111111;
  clip-path: polygon(100% 0, 100% 100%, 0 100%, 0 4%, 4% 0);
  border-radius: 8px;
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
    padding: 0 16px;
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
    color: #bb77ff;
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

  .active-block {
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
