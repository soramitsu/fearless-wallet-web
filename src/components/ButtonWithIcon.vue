<template>
  <BorderButton
    borderRadius="mini"
    type="secondary"
    :text="text"
    :icon="iconName"
    :width="width"
    @click="$emit('click')"
  />
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { IconType } from '@/util/iconName';
import getIconName from '@/util/iconName';
import BorderButton from './BorderButton.vue';

@Component({
  components: {
    BorderButton,
  },
})
export default class extends Vue {
  @Prop(String) text!: string;
  @Prop(String) iconType!: IconType;
  @Prop(String) width!: string;

  get iconName() {
    return getIconName(this.iconType);
  }
}
</script>

<style lang="scss" scoped>
.button-with-icon {
}
</style>
