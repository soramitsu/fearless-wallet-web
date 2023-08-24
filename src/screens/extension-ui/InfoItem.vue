<template>
  <Fragment>
    <dt class="name">{{ name }}</dt>
    <dd class="value">{{ value }}</dd>
  </Fragment>
</template>

<script lang="ts" setup>
import { Fragment } from 'vue-fragment';

const { name, value } = defineProps({
  name: { type: String, required: true },
  value: { type: [String, Number], required: true },
});
</script>

<style lang="scss" scoped>
.name {
  color: $gray-color;
  font-weight: 700;
  font-size: 12px;
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
