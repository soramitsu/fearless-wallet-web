<template>
  <Popup
    class="notification-popup"
    :showHeader="showHeader"
    :handlerClose="handlerClose"
    :sizeWidth="sizeWidth"
    :showBorder="true"
  >
    <div class="notification-popup-content">
      <img v-if="showWarningIcon" src="@/assets/info-triangle.svg" class="img" />

      <div class="text">{{ text }}</div>
      <div :class="classesSubtext">{{ subtext }}</div>

      <Button v-if="showAcceptButton" class="button" size="medium" :text="acceptButtonText" @click="handlerAccept" />

      <BorderButton
        v-if="showRejectButton"
        class="button reject-button"
        size="medium"
        :text="rejectButtonText"
        @click="handlerClose"
      />
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import Popup from './Popup.vue';
import Button from './Button.vue';
import BorderButton from './BorderButton.vue';

interface Headers {
  text: string;
  subtext: string;
}

type Size = 'mini' | 'small' | 'medium' | 'big';

@Component({
  components: {
    Popup,
    Button,
    BorderButton,
  },
})
export default class NotificationPopup extends Vue {
  @Prop({ default: () => ({ text: '', subtext: '' }) }) headers!: Headers;
  @Prop({ default: false }) showAcceptButton!: boolean;
  @Prop({ default: false }) showRejectButton!: boolean;
  @Prop({ default: true }) showWarningIcon!: boolean;
  @Prop({ default: true }) showHeader!: boolean;
  @Prop({ default: 'medium' }) sizeWidth!: Size;
  @Prop({ default: 'Cancel' }) rejectButtonText!: string;
  @Prop(String) acceptButtonText!: string;
  @Prop(Function) handlerClose!: VoidFunction;
  @Prop(Function) handlerAccept!: VoidFunction;

  get text() {
    return this.headers.text;
  }

  get subtext() {
    return this.headers.subtext;
  }

  get classesSubtext() {
    return ['subtext', `subtext-${this.sizeWidth}`];
  }
}
</script>

<style lang="scss" scoped>
.notification-popup {
  z-index: 299;

  .notification-popup-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0 10px;

    .img {
      margin-bottom: 20px;
    }

    .text {
      font-weight: 700;
      font-size: 18px;
      line-height: 150%;
      margin-bottom: 4px;
    }

    .button {
      margin-top: 20px;
      width: 150px;
      width: 100%;
    }

    .reject-button {
      margin-top: 10px;
    }
  }

  .subtext {
    color: $gray-color;
    line-height: 150%;
  }

  .subtext-medium {
    width: 255px;
  }

  .subtext-big {
    width: 300px;
  }
}
</style>
