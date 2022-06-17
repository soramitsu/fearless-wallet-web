<template>
  <AboveForm :blur="true" :header="header" :closeHandler="closeForm" class="activity-form">
    <div class="activity-content">
      <slot></slot>

      <Button
        v-if="showButton"
        size="big"
        class="button"
        :text="buttonText"
        :disabled="buttonDisabled"
        @click="handlerButton"
      />
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import Button from '@/components/Button.vue';
import AboveForm from '@/components/AboveForm.vue';

@Component({
  components: {
    AboveForm,
    Button,
  },
})
export default class ActivityForm extends Vue {
  @Prop(String) header!: string;
  @Prop(String) buttonText!: string;
  @Prop({ default: true }) showButton!: boolean;
  @Prop({ default: false }) buttonDisabled!: boolean;
  @Prop(Function) handlerButton!: VoidFunction;
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
  }
}
</style>
