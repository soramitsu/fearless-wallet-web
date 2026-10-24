<template>
  <div class="loader" data-testid="loader">
    <div class="circle">
      <img :src="sunBadge" class="logo" alt="" />
    </div>
  </div>
</template>

<script setup lang="ts">
import sunBadge from '@/assets/brand/winged-sun-badge-lines.svg';
</script>

<style lang="scss" scoped>
.loader {
  margin: auto;

  .circle {
    position: relative;
    box-sizing: border-box;
    border-radius: 50%;
    width: 96px;
    height: 96px;
    border: 8px solid $default-background-color;
    display: grid;
    place-items: center;
  }

  .circle:after {
    content: ' ';
    position: absolute;
    inset: -8px;
    box-sizing: border-box;
    display: block;
    width: 96px;
    height: 96px;
    border-radius: 50%;
    border: 8px solid $pink-color;
    border-color: $pink-color transparent transparent;
    animation: arc 2s linear infinite;

    @keyframes arc {
      0% {
        transform: rotate(0deg);
      }
      100% {
        transform: rotate(360deg);
      }
    }
  }

  .logo {
    height: 64px;
    width: 64px;
    display: block;
  }
}

@media (prefers-reduced-motion: reduce) {
  .loader .circle:after {
    animation: none;
  }
}

html[data-fw-effects='reduced'] .loader .circle:after {
  animation: none;
}
</style>
