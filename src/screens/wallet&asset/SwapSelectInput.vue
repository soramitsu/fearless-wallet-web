<template>
  <Corners size="big">
    <div class="select"></div>
  </Corners>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class SwapSelectInput extends Vue {
  @Prop({ default: '' }) text!: string;
  @Prop({ default: '' }) amount!: string;
  @Prop({ default: '' }) price!: string;
  @Prop({ default: '' }) balance!: string;
}
</script>

<style lang="scss" scoped>
.select {
  width: 100%;
  height: 96px;
  background-color: $secondary-background-color;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border-radius: $default-border-radius;
  border: 1px solid $secondary-background-color;
}
</style>
