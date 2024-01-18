<template>
  <div class="background-circle" :style="circleStyles">
    <ExternalLogo :name="icon" :width="87" />
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

type Props = {
  shadowColor: string;
  icon: string;
};

const props = defineProps<Props>();

const circleStyles = computed(() => ({
  filter: `drop-shadow(0px 6.53061px 25px #${props.shadowColor})`,
}));
</script>

<style lang="scss" scoped>
.background-circle {
  width: 90px;
  height: 90px;
  background-color: #111;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
