<template>
  <div class="link" @click="$emit('click')">
    {{ $t(text) }}
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class Link extends Vue {
  @Prop({ default: 0 }) text!: number;
}
</script>

<style lang="scss" scoped>
.link {
  color: $pink-lavender-color;
  text-decoration: underline;
  text-align: left;
  cursor: pointer;
}
</style>
