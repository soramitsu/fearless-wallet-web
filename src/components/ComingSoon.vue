<template>
  <div class="coming-soon">
    <Icon :icon="getImg" className="img" />

    <div class="name">{{ $t(`menu.${prepName}`) }} {{ $t('common.comingSoon') }}</div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

const props = defineProps<{ name: string }>();
const prepName = props.name.toLowerCase();
const getImg = computed(() => props.name.toLowerCase());
</script>

<style lang="scss" scoped>
.coming-soon {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;

  .name {
    margin-top: 25px;
    color: $gray-2-color;
  }

  .img {
    height: 100px;
    width: 100px;
    opacity: 50%;
  }
}
</style>
