<template>
  <AboveForm
    :blur="true"
    :header="header"
    :showBackIcon="showBackIcon"
    :handlerBack="handlerBack"
    :closeHandler="closeForm"
    class="activity-form"
  >
    <div class="activity-content">
      <slot></slot>

      <div class="activity-buttons">
        <BorderButton
          v-if="buttonTextTwo"
          size="big"
          class="button"
          :text="buttonTextTwo"
          :disabled="buttonDisabled"
          :iconName="iconNameTwo"
          @click="handlerButtonTwo"
        />

        <Button
          size="big"
          class="button"
          :text="buttonText"
          :disabled="buttonDisabled"
          :iconName="iconName"
          @click="handlerButton"
        />
      </div>
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import BorderButton from '@/components/BorderButton.vue';
import Button from '@/components/Button.vue';
import AboveForm from '@/components/AboveForm.vue';

@Component({
  components: {
    Button,
    AboveForm,

    BorderButton,
  },
})
export default class ActivityForm extends Vue {
  @Prop(String) header!: string;
  @Prop(String) buttonText!: string;
  @Prop(String) buttonTextTwo!: string;
  @Prop(String) iconName!: string;
  @Prop(String) iconNameTwo!: string;
  @Prop({ default: false }) buttonDisabled!: boolean;
  @Prop({ default: false }) showBackIcon!: boolean;
  @Prop(Function) handlerButton!: VoidFunction;
  @Prop(Function) handlerButtonTwo!: VoidFunction;
  @Prop(Function) handlerBack!: VoidFunction;
  @Prop(Function) closeForm!: VoidFunction;
}
</script>

<style lang="scss" scoped>
.activity-form {
  .activity-content {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 100%;
  }

  .button {
    width: 100%;
    margin-right: 10px;

    &:last-child {
      margin-right: 0;
    }
  }

  .activity-buttons {
    display: flex;
  }
}
</style>
