<template>
  <div class="background-circle" :style="circleStyles">
    <ExternalLogo :name="icon" :width="87" />
  </div>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';

@Component
export default class AssetIcon extends Vue {
  @Prop({ type: String }) shadowColor!: string;
  @Prop({ type: String }) icon!: string;

  get circleStyles() {
    return {
      filter: `drop-shadow(0px 6.53061px 25px #${this.shadowColor})`,
    };
  }
}
</script>

<style lang="scss" scoped>
.background-circle {
  width: 90px;
  height: 90px;
  background-color: #111;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
