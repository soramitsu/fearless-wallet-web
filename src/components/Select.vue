<template>
  <Corners :size="size">
    <div :class="containerSelectClasses">
      <s-select v-model="vModel" :placeholder="placeholder" :size="size" :disabled="disabled">
        <s-option v-for="{ value, label } in options" :key="label" :value="value" :label="label" />
      </s-select>
    </div>
  </Corners>
</template>

<script lang="ts">
import { Component, Vue, Prop, VModel } from 'vue-property-decorator';
import Corners from './Corners.vue';

type Size = 'small' | 'medium' | 'big';

interface Options {
  label: string;
  value: string;
}

@Component({
  components: { Corners },
})
export default class Select extends Vue {
  @VModel({ type: String }) vModel!: string;
  @Prop(String) placeholder!: string;
  @Prop(Array) options!: Options[];
  @Prop(Boolean) disabled!: boolean;
  @Prop({ default: 'medium' }) size!: Size;

  get containerSelectClasses() {
    // for "small" and "mini" sizes also medium
    const sizeName = this.size === 'big' ? 'big' : 'medium';

    return [`select-style-default`, `select-size-${sizeName}`];
  }
}
</script>

<style lang="scss">
.select-style-default {
  input {
    color: $pink-lavender-color !important;
  }

  .s-select .el-input__inner {
    background-color: rgba(255, 255, 255, 0.05) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    padding-top: 25px !important;
  }

  .s-select .s-placeholder {
    color: $default-white !important;
    margin-top: 12px !important;
    padding-left: 25px !important;
  }

  .s-select input {
    padding-left: 25px !important;
  }

  .s-select .el-select i.el-icon-arrow-up:before {
    color: rgba(255, 255, 255, 0.5) !important;
  }
}

.el-select-dropdown {
  background-color: #111111 !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  margin-top: 5px !important;
  min-width: 370px !important;
  max-width: 370px !important;
}

.el-select-dropdown__item {
  color: $default-white !important;

  &:hover {
    background-color: rgba(255, 255, 255, 0.1) !important;
  }
}

.popper__arrow {
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
}

.selected {
  background-color: rgba(255, 255, 255, 0.1) !important;
  color: rgba(255, 255, 255, 1) !important;
}

.select-size-big {
  .s-select {
    clip-path: $big-clip-path-left-top-and-right-bottom;
  }
}

.select-size-medium {
  .s-select {
    clip-path: $medium-clip-path-left-top-and-right-bottom;
  }
}
</style>
