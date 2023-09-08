<template>
  <Popup :showBorder="true" @handlerClose="handlerClose">
    <div class="confirmation-popup">
      <slot></slot>

      <div class="text">
        {{ $t(text) }}
      </div>

      <div class="activity-bock">
        <FButton
          text="common.no"
          width="48%"
          size="big"
          fontSize="big"
          type="secondary"
          :border="false"
          @click="handlerClose"
        />

        <FButton width="48%" size="big" fontSize="big" text="common.yes" @click="handlerAgree" />
      </div>
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class ConfirmationPopup extends Vue {
  @Prop(String) text!: string;
  @Prop(Function) handlerClose!: VoidFunction;
  @Prop(Function) handlerAgree!: VoidFunction;
}
</script>

<style lang="scss" scoped>
.confirmation-popup {
  .text {
    color: $gray-color;
    margin-bottom: 16px;
  }

  .activity-bock {
    display: flex;
    justify-content: space-between;
    padding: 0 $default-padding;
  }
}
</style>
