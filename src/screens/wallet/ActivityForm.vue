<template>
  <AboveForm :blur="true" :header="header" :closeHandler="closeForm" class="activity-form">
    <div class="activity-content">
      <slot></slot>

      <div>
        <div class="fee">
          <slot name="fee"></slot>
        </div>

        <Button size="big" class="button" :text="buttonText" :handler="handlerButton" />
      </div>
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
export default class extends Vue {
  @Prop(String) header!: string;
  @Prop(String) buttonText!: string;
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

  .fee {
    margin-bottom: 20px;
  }

  .button {
    width: 100%;
  }
}
</style>
