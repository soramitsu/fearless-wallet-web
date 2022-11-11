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

    <Rotate :ref="rotateRef" :isActive="isActiveRotate" class="rotate-icon">
      <SIcon name="chevron-bottom-16" />
    </Rotate>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, VModel } from 'vue-property-decorator';
import Input from '@/components/Input.vue';
import Button from '@/components/Button.vue';
import QR from '@/components/QR.vue';
import AboveForm from '@/components/AboveForm.vue';
import BorderButton from '@/components/BorderButton.vue';
import SelectNetworkPopup from '@/screens/wallet&asset/SelectNetworkPopup.vue';
import Rotate from '@/components/Rotate.vue';
import { firstCharToUp } from '@/helpers/common';

@Component({
  components: {
    QR,
    Input,
    Button,
    Rotate,
    AboveForm,
    BorderButton,
    SelectNetworkPopup,
  },
})
export default class RotateInput extends Vue {
  readonly inputRef = 'input';
  readonly rotateRef = 'rotate';

  showSelectNetworkPopup = false;

  @VModel({ type: String || Number }) vModel!: string;
  @Prop(String) placeholder!: string;
  @Prop(Boolean) isActiveRotate!: boolean;

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

  .rotate-icon {
    position: relative;
    right: 40px;
    top: 23px;
    height: 15px;

    &:hover {
      cursor: pointer;
    }

    .s-icon-chevron-bottom-16 {
      color: rgba(255, 255, 255, 0.5);
    }
  }
}
</style>
