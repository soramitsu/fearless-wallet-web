<template>
  <div class="wrapper" @click="$emit('click')">
    <Input
      v-model="firstCharToUpVModel"
      size="big"
      class="rotate-input"
      :placeholder="placeholder"
      :ref="inputRef"
      :readonly="true"
      :cursorPointer="true"
    />

    <Rotate v-if="icon === 'rotate'" :ref="rotateRef" :isActive="isActiveRotate" class="icon">
      <SIcon name="chevron-bottom-16" />
    </Rotate>

    <div v-else-if="icon === 'close'" class="icon">
      <Icon icon="close" class="close-icon" />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, VModel } from 'vue-property-decorator';
import SelectNetworkPopup from '@/screens/wallet&asset/SelectNetworkPopup.vue';
import { firstCharToUp } from '@/helpers/common';

@Component({
  components: {
    SelectNetworkPopup,
  },
})
export default class InputWithIcon extends Vue {
  readonly inputRef = 'input';
  readonly rotateRef = 'rotate';

  showSelectNetworkPopup = false;

  @VModel({ type: String || Number }) vModel!: string;
  @Prop(String) placeholder!: string;
  @Prop(Boolean) isActiveRotate!: boolean;
  @Prop(String) icon!: 'rotate' | 'close';

  get firstCharToUpVModel() {
    return firstCharToUp(this.vModel);
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
