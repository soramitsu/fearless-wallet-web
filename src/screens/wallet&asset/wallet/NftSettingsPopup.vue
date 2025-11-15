<template>
  <Popup
    sizeWidth="mini"
    verticalPlacement="top"
    horizontalPlacement="right"
    :top="top"
    :left="-17"
    :showBorder="true"
    :showHeader="false"
    @handlerClose="emit('handlerClose')"
  >
  </Popup>
</template>

<script lang="ts" setup>
type Props = {
  top: number;
};

const emit = defineEmits<{
  handlerClose: [];
}>();

defineProps<Props>();
</script>

<style lang="scss" scoped>
.account-settings {
  color: $default-white;
  font-weight: 500;
  height: fit-content;

  .row {
    display: flex;
    margin: 0 0 20px 20px;

    &:last-child {
      margin-bottom: 0;
    }

    &:hover {
      cursor: pointer;
      color: rgba(255, 255, 255, 0.9);

      .icon {
        filter: invert(0.1);
      }
    }

    .icon {
      width: 20px;
      height: 20px;
      filter: invert(0.25);
    }

    .label {
      margin: auto 0 auto 10px;
      width: 160px;
      text-align: left;
    }
  }
}
</style>
