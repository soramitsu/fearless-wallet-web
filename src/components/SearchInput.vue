<template>
  <div class="search-input">
    <s-input v-model="vModel" :placeholder="placeholder" size="small" class="input" />
    <s-icon name="basic-search-24" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, VModel } from 'vue-property-decorator';

@Component
export default class extends Vue {
  @VModel({ type: String }) vModel!: string;
  @Prop(String) placeholder!: string;
}
</script>

<style lang="scss" scoped>
.search-input {
  display: flex;
  align-items: center;

  .input {
    clip-path: var(--mini-clip-path-left-top-and-right-bottom) !important;
  }

  .s-icon-basic-search-24 {
    color: rgba(255, 255, 255, 0.5);
    font-size: 20px !important;
    margin-left: -30px;
  }
}
</style>
