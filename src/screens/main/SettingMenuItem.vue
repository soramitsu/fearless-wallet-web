<template>
  <div class="row" @click="handleOpen">
    <div class="description">
      <Icon :icon="icon" :className="iconClass" />

      <div class="label">{{ $t(title) }}</div>
    </div>

    <Icon icon="chevron-right" className="chevron-right" />
  </div>
</template>

<script lang="ts" setup>
const iconClass = ['icon', 'icon--width'];

defineProps<{ icon: string; title: string }>();

const emit = defineEmits<{
  onOpen: [];
}>();

const handleOpen = () => emit('onOpen');
</script>

<style lang="scss" scoped>
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 20px 28px 20px;

  &:last-child {
    margin-bottom: 0;
  }

  &:hover {
    cursor: pointer;
    color: rgba(255, 255, 255, 0.9);

    .icon {
      color: rgba(255, 255, 255, 0.9);
    }

    .chevron-right {
      color: $grayish-white;
    }
  }

  .icon {
    color: $grayish-white;
  }

  .icon--width {
    width: 20px;
    height: 20px;
  }

  .chevron-right {
    width: 20px;
    height: 20px;
    color: $gray-color;
  }

  .description {
    display: flex;
  }

  .label {
    margin: auto 0 auto 10px;
    text-align: left;
  }
}
</style>
