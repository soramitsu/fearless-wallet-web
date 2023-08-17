<template>
  <div class="blur" v-on="$listeners">
    <slot></slot>
  </div>
</template>
<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component
export default class Blur extends Vue {}
</script>

<style lang="scss" scoped>
.blur {
  background-color: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(5px);
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
}
</style>
