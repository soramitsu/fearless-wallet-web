<template>
  <div class="validate-input">
    <Input
      v-model="vModel"
      size="big"
      :placeholder="placeholder"
      :maxlength="maxlength"
      :showPassword="showPassword"
      :isError="isError"
    />

    <div v-show="isError" class="error-descriptions">{{ errorDescriptions }}</div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, VModel } from 'vue-property-decorator';
import Input from './Input.vue';

@Component({
  components: { Input },
})
export default class ValidatedInput extends Vue {
  @VModel({ type: String }) vModel!: string;
  @Prop(String) errorDescriptions!: string;
  @Prop(String) placeholder!: string;
  @Prop(Boolean) isError!: boolean;
  @Prop({ default: 50 }) maxlength!: number;
  @Prop({ default: false }) showPassword!: boolean;
}
</script>

<style lang="scss" scoped>
.validate-input {
  i {
    color: #ffffff;
  }

  .error-descriptions {
    font-size: 14px;
    color: #ee7700;
    text-align: left;
    margin: 14px 0;
  }
}
</style>
