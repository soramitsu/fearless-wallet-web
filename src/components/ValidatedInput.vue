<template>
  <div class="validate-input">
    <FInput
      :value="vModel"
      ref="input"
      :size="size"
      :placeholder="placeholder"
      :maxlength="maxlength"
      :showPassword="showPassword"
      :isError="isError"
      :readonly="readonly"
      :disabled="disabled"
      :typeText="typeText"
      :type="type"
      data-testid="input"
      @change="chnageVmodel"
    />

    <div v-show="showErrorText" class="error-descriptions" data-testid="errorDescriptions">
      <Icon v-if="errorWithIcon" icon="warning" className="warning" />
      {{ $t(errorDescriptions) }}
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Ref } from 'vue-property-decorator';
import type FInput from '@/components/FInput.vue';
type Type = 'text' | 'textarea' | 'text-file' | 'number' | 'email';

@Component({})
export default class ValidatedInput extends Vue {
  vModel = '';

  @Prop(String) errorDescriptions!: string;
  @Prop(String) placeholder!: string;
  @Prop(Boolean) isError!: boolean;
  @Prop({ default: 50 }) maxlength!: number;
  @Prop({ default: false }) showPassword!: boolean;
  @Prop({ default: false }) readonly!: boolean;
  @Prop({ default: 'none' }) typeText!: string;
  @Prop({ default: 'text' }) type!: Type;
  @Prop({ default: false }) disabled!: boolean;
  @Prop({ default: 'big' }) size!: string;
  @Prop({ default: false }) errorWithIcon!: string;

  @Ref('input') readonly inputComponent!: FInput;

  get showErrorText() {
    return this.isError && this.errorDescriptions;
  }

  get input() {
    return this.inputComponent.input as HTMLInputElement;
  }

  chnageVmodel(value: string) {
    this.vModel = value;
  }
}
</script>

<style lang="scss" scoped>
.validate-input {
  i {
    color: $plain-white;
  }

  .error-descriptions {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 5px;
    font-size: 14px;
    color: #ee7700;
    text-align: left;
    margin-top: 15px;
  }
  .warning {
    color: #ee7700;
    width: 16px;
    min-width: 16px;
    height: 16px;
  }
}
</style>
