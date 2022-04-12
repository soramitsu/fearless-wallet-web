<template>
  <div class="validate-input">
    <s-input
      v-model="vModel"
      :placeholder="placeholder"
      :maxlength="maxlength"
      :class="inputClasses"
      size="big"
      show-password
    />
    <div v-show="isError" class="error-descriptions">{{ errorDescriptions }}</div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, VModel } from 'vue-property-decorator';

@Component({})
export default class extends Vue {
  @VModel({ type: String }) vModel!: string;
  @Prop(String) errorDescriptions!: string;
  @Prop(String) placeholder!: string;
  @Prop({ default: 50 }) maxlength!: number;
  @Prop(Boolean) isError!: boolean;

  get inputClasses() {
    return [
      'input',
      {
        'error-input': this.isError,
      },
    ];
  }
}
</script>

<style lang="scss" scoped>
.validate-input {
  i {
    color: #ffffff;
  }

  .input {
    font-size: 24px;
    margin: 15px 0;
  }

  .error-input {
    border: 1px solid #ee7700 !important;
  }

  .error-descriptions {
    font-size: 14px;
    color: #ee7700;
    text-align: left;
    margin-bottom: 14px;
  }
}
</style>
