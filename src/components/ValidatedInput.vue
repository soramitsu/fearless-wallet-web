<template>
  <div class="validate-input">
    <Input
      v-model="vModel"
      ref="input"
      size="big"
      :placeholder="placeholder"
      :maxlength="maxlength"
      :showPassword="showPassword"
      :isError="isError"
      :readonly="readonly"
      :typeText="typeText"
      :type="type"
    />

    <div v-show="showErrorText" class="error-descriptions">{{ $t(errorDescriptions) }}</div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, VModel, Ref } from 'vue-property-decorator';
import Input from './Input.vue';

type Type = 'text' | 'textarea' | 'text-file' | 'number' | 'email';

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
  @Prop({ default: false }) readonly!: boolean;
  @Prop({ default: 'text' }) type!: Type;
  @Prop({ default: 'uppercase' }) typeText!: string;
  @Ref('input') readonly inputComponent!: Input;

  get showErrorText() {
    return this.isError && this.errorDescriptions;
  }

  get input() {
    return this.inputComponent.input as HTMLInputElement;
  }
}
</script>

<style lang="scss" scoped>
.validate-input {
  i {
    color: $plain-white;
  }

  .error-descriptions {
    font-size: 14px;
    color: #ee7700;
    text-align: left;
    margin-top: 15px;
  }
}
</style>
