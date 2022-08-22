<template>
  <Popup :showBorder="true" :handlerClose="handlerClose">
    <div class="confirmation-popup">
      <slot></slot>

      <div class="text">
        {{ text }}
      </div>

      <div class="activity-bock">
        <Button
          text="No"
          width="48%"
          size="big"
          fontSize="big"
          type="secondary"
          :border="false"
          @click="handlerClose"
        />

        <Button width="48%" size="big" fontSize="big" text="Yes" @click="handlerAgree" />
      </div>
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import Popup from './Popup.vue';
import Button from './Button.vue';

@Component({
  components: {
    Popup,
    Button,
  },
})
export default class ConfirmationPopup extends Vue {
  @Prop(String) text!: string;
  @Prop(Function) handlerClose!: VoidFunction;
  @Prop(Function) handlerAgree!: VoidFunction;
}
</script>

<style lang="scss" scoped>
.confirmation-popup {
  .text {
    color: rgba(255, 255, 255, 0.5);
    margin-bottom: 16px;
  }

  .activity-bock {
    display: flex;
    justify-content: space-between;
    padding: 0 16px;
  }
}
</style>
