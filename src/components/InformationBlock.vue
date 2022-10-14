<template>
  <div class="information-block">
    <img src="@/assets/info-triangle.svg" class="img" />

    <div class="info-text">
      {{ text }}
    </div>
  </div>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';

@Component
export default class ExportForm extends Vue {
  @Prop(String) text!: string;
}
</script>

<style lang="scss" scoped>
.information-block {
  display: flex;

  .info-text {
    text-align: left;
    font-size: 13px;
    margin: auto 0 auto 20px;
    width: 420px;
    line-height: 170%;
  }
}
</style>
