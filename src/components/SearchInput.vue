<template>
  <div class="search-input-wrapper">
    <Input v-model="vModel" :placeholder="placeholder" size="small" :style="inputStyle" />

    <SIcon name="basic-search-24" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, VModel } from 'vue-property-decorator';

@Component
export default class SearchInput extends Vue {
  @VModel({ type: String }) vModel!: string;
  @Prop(String) placeholder!: string;
  @Prop(String) width!: string;

  get inputStyle() {
    const styles: Record<string, string> = {};

    if (this.width) styles.width = `${this.width}`;

    return styles;
  }
}
</script>

<style lang="scss">
.search-input-wrapper {
  .s-input__input {
    width: calc(100% - 20px);
    flex: none;
  }
}
</style>

<style lang="scss" scoped>
.search-input-wrapper {
  display: flex;
  align-items: center;
  user-select: none;

  .s-icon-basic-search-24 {
    color: $gray-color;
    font-size: 20px !important;
    margin-left: -30px;
  }
}
</style>
