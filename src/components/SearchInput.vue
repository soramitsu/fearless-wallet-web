<template>
  <div class="search-input">
    <Input v-model="vModel" :placeholder="placeholder" size="small" class="search-input-path" />

    <s-icon name="basic-search-24" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, VModel } from 'vue-property-decorator';
import Input from '@/components/Input.vue';

@Component({
  components: {
    Input,
  },
})
export default class extends Vue {
  @VModel({ type: String }) vModel!: string;
  @Prop(String) placeholder!: string;
}
</script>

<style lang="scss" scoped>
.search-input {
  display: flex;
  align-items: center;

  .s-icon-basic-search-24 {
    color: rgba(255, 255, 255, 0.5);
    font-size: 20px !important;
    margin-left: -30px;
  }

  .search-input-path {
    clip-path: var(--medium-clip-path-left-top-and-right-bottom);
    width: 230px;
  }
}
</style>
