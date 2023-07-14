<template>
  <div class="information-block">
    <Icon icon="info-triangle" className="img" />

    <div class="info-text">
      {{ $t(text) }}
    </div>
  </div>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';

@Component
export default class InformationBlock extends Vue {
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

  .img {
    width: 50px;
    height: 50px;
  }
}
</style>
