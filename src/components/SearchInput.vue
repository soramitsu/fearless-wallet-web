<template>
  <div class="search-input">
    <Input v-model="vModel" :placeholder="placeholder" size="small" :class="getClasses" />

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
export default class SearchInput extends Vue {
  @VModel({ type: String }) vModel!: string;
  @Prop(String) placeholder!: string;
  @Prop({ default: false }) isBig!: boolean;

  get getClasses() {
    return ['search-input-path', this.isBig ? 'search-input-big' : 'search-input-medium'];
  }
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
    clip-path: $medium-clip-path-left-top-and-right-bottom;
  }
  .search-input-medium {
    width: 230px;
  }
  .search-input-big {
    width: 100%;
  }
}
</style>
