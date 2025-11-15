<template>
  <dt class="name">{{ name }}</dt>
  <dd class="value">{{ value }}</dd>
</template>

<script lang="ts" setup>
const { name, value } = defineProps({
  name: { type: String, required: true },
  value: { type: [String, Number], required: true },
});
</script>

<style lang="scss" scoped>
.name {
  color: $gray-color;
  font-weight: 700;
  font-size: 0.75rem;
  line-height: 20px;
  text-transform: uppercase;
}

.value {
  max-width: 370px;
  overflow: hidden;
  line-height: 20px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
