<template>
  <div class="wrapper" @click="click">
    <FInput
      v-model="model"
      size="big"
      class="rotate-input"
      :placeholder="placeholder"
      :readonly="true"
      :cursorPointer="true"
    />

    <Rotate v-if="icon === 'rotate'" :isActive="isActiveRotate" class="icon">
      <SIcon name="chevron-bottom-16" />
    </Rotate>

    <div v-else-if="isCloseIcon" class="icon" @click="clickIcon">
      <Icon icon="close" class="close-icon" />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, VModel } from 'vue-property-decorator';

@Component({})
export default class InputWithIcon extends Vue {
  showSelectNetworkPopup = false;

  @VModel({ type: String || Number }) vModel!: string;
  @Prop(String) placeholder!: string;
  @Prop(Boolean) isActiveRotate!: boolean;
  @Prop(String) icon!: 'rotate' | 'close';

  get model() {
    return this.vModel;
  }

  get isCloseIcon() {
    return this.icon === 'close' && this.model !== '';
  }

  click() {
    if (this.icon === 'rotate') this.$emit('click');
  }

  clickIcon() {
    this.$emit('click');
  }
}
</script>

<style lang="scss" scoped>
.wrapper {
  display: flex;
  justify-content: space-between;

  .rotate-input {
    flex: 0 0 529px;
    width: 529px;

    & .el-input__inner {
      text-transform: capitalize;
    }
  }

  .icon {
    position: relative;
    right: 40px;
    top: 23px;
    height: 15px;

    &:hover {
      cursor: pointer;
    }

    .s-icon-chevron-bottom-16 {
      color: $gray-color;
    }

    .close-icon {
      height: 15px;
      width: 15px;
      color: $gray-color;
    }
  }
}
</style>
