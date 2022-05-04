<template>
  <s-button
    :type="type"
    :border-radius="borderRadius"
    :size="size"
    class="button"
    :disabled="disabled"
    @click="handler"
  >
    {{ text }}
  </s-button>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

type Size = 'mini' | 'small' | 'medium' | 'big';
type Type = 'primary' | 'secondary';

@Component
export default class extends Vue {
  @Prop(String) text!: string;
  @Prop({ default: 'primary' }) type!: Type;
  @Prop({ default: false }) disabled!: boolean;
  @Prop({ default: 'medium' }) size!: Size;
  @Prop({ default: 'medium' }) borderRadius!: Size;
  @Prop(Function) handler!: VoidFunction;
}
</script>

<style lang="scss" scoped>
.button {
  // width: 100%;
  font-size: 18px;
}

.el-button {
  clip-path: var(--default-clip-path-left-top-and-right-bottom);
}

.el-button + .el-button {
  margin-left: 0;
}
</style>
