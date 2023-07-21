<template>
  <div class="wrapper" @click="click">
    <Input
      v-model="firstCharToUpVModel"
      size="big"
      class="rotate-input"
      :placeholder="placeholder"
      :readonly="true"
      :cursorPointer="true"
    />

    <Rotate v-if="icon === 'rotate'" :isActive="isActiveRotate" class="icon">
      <SIcon name="chevron-bottom-16" />
    </Rotate>

    <div v-else-if="icon === 'close' && firstCharToUpVModel !== ''" class="icon" @click="clickIcon">
      <Icon icon="close" class="close-icon" />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, VModel } from 'vue-property-decorator';
import SelectNetworkPopup from '@/screens/wallet&asset/SelectNetworkPopup.vue';
import { firstCharToUp } from '@/helpers/';

@Component({
  components: {
    SelectNetworkPopup,
  },
})
export default class InputWithIcon extends Vue {
  showSelectNetworkPopup = false;

  @VModel({ type: String || Number }) vModel!: string;
  @Prop(String) placeholder!: string;
  @Prop(Boolean) isActiveRotate!: boolean;
  @Prop(String) icon!: 'rotate' | 'close';

  get firstCharToUpVModel() {
    return firstCharToUp(this.vModel);
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
