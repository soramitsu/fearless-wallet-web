<template>
  <Corners>
    <div :class="tabButtonClasses">
      {{ name }}
    </div>
  </Corners>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import Corners from '@/components/Corners.vue';

@Component({
  components: { Corners },
})
export default class TabButton extends Vue {
  @Prop({ default: '' }) name!: string;
  @Prop({ default: false }) isActive!: boolean;

  get tabButtonClasses() {
    return [
      'tab-button',
      {
        'active-background': this.isActive,
      },
    ];
  }
}
</script>

<style lang="scss" scoped>
.tab-button {
  background-color: rgba(255, 255, 255, 0.05);
  padding: 0 15px;
  border-radius: 4px;
  font-size: 13px;
  line-height: 36px;
  clip-path: $medium-clip-path-left-top-and-right-bottom;
  border: 1px solid rgba(255, 255, 255, 0.1);
  height: 36px;

  &:hover {
    cursor: pointer;
  }
}

.active-background {
  background-color: rgba(119, 0, 238, 0.25);
}
</style>
