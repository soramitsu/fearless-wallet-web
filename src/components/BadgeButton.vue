<template>
  <button class="button" @click="onClick">{{ $t(text) }}</button>
</template>

<script lang="ts" setup>
type Props = {
  text: string;
};

defineProps<Props>();

const emit = defineEmits(['click']);
const onClick = () => emit('click');
</script>

<style lang="scss" scoped>
.button {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 5px 15px;
  height: 30px;
  background: $secondary-background-color;
  border-radius: 30px;
  font-weight: 700;
  font-size: 12px;
  text-transform: uppercase;
  color: $plain-white;
  margin: 5px 14px 0 0;
  border: none;
  cursor: pointer;

  &:hover {
    background: $default-background-color;
  }
}
</style>
