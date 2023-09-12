<template>
  <Popup :showBorder="true" @handlerClose="$emit('handlerClose')">
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
          @click="$emit('handlerClose')"
        />

        <FButton width="48%" size="big" fontSize="big" text="common.yes" @click="$emit('handlerAgree')" />
      </div>
    </div>
  </Popup>
</template>

<script lang="ts" setup>
defineProps<{ text: string }>();
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
