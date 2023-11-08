<template>
  <div class="container">
    <Icon icon="sad-face" className="img" />

    <span class="subtext">{{ message }}</span>
  </div>
</template>

<script lang="ts" setup>
type Props = {
  message: string;
};

defineProps<Props>();
</script>

<style lang="scss" scoped>
.container {
  display: flex;
  flex-flow: column;
  align-items: center;
  place-content: center;
  gap: 35px;
}

.subtext {
  font-size: 18px;
  color: $default-white;
}

.img {
  width: 91px;
  height: 91px;
}
</style>
