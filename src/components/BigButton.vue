<template>
  <s-button type="primary" border-radius="medium" size="big" class="button" :disabled="disabled" @click="handler">
    {{ text }}
  </s-button>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class extends Vue {
  @Prop(String) text!: string;
  @Prop({ default: false }) disabled!: boolean;
  @Prop(Function) handler!: VoidFunction;
}
</script>

<style lang="scss" scoped>
.button {
  width: 100%;
  font-size: 18px;
}

.el-button {
  clip-path: var(--default-clip-path-left-top-and-right-bottom);
}
</style>
