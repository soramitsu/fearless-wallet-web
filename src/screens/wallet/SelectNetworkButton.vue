<template>
  <Corners>
    <div :class="classes" @click="$emit('click')">
      {{ textFormatted }}

      <Rotate :isActive="isActive" class="icon-chevron">
        <s-icon name="chevron-bottom-16" />
      </Rotate>
    </div>
  </Corners>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { firstCharToUp } from '@/util/stringHelper';
import Rotate from '@/components/Rotate.vue';
import Corners from '@/components/Corners.vue';

@Component({
  components: {
    Rotate,
    Corners,
  },
})
export default class SelectNetworkButton extends Vue {
  @Prop(String) text!: string;
  @Prop(Boolean) isActive!: boolean;

  get textFormatted() {
    return firstCharToUp(this.text);
  }

  get classes() {
    return [
      'select-network-button',
      {
        active: this.isActive,
      },
    ];
  }
}
</script>

<style lang="scss" scoped>
.select-network-button {
  position: relative;
  display: flex;
  justify-content: space-between;
  clip-path: $medium-clip-path-left-top-and-right-bottom;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  border-radius: 5px;
  background-color: #201c1f;
  height: 36px;
  width: 250px;
  padding: 6px 12px;
  font-size: 14px;
  align-items: center;
  border: 1px solid #201c1f;

  &:hover {
    cursor: pointer;
  }

  .img {
    width: 24px;
    margin-right: 7px;
  }

  .icon-chevron {
    margin-left: 7px;
  }

  .s-icon-chevron-bottom-16 {
    color: rgba(255, 255, 255, 0.5);
    font-size: 10px !important;
  }
}

.active {
  border: 1px solid rgba(255, 255, 255, 0.1);
}
</style>
