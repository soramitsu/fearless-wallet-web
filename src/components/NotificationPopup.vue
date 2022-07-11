<template>
  <Popup :handlerClose="handlerClose" :sizeWidth="sizeWidth" :showBorder="true">
    <div class="notification-popup">
      <img v-if="showWarningIcon" src="@/assets/info-triangle.svg" class="img" />

      <div class="text">{{ text }}</div>
      <div :class="classesSubtext">{{ subtext }}</div>

      <Button v-if="showButton" size="medium" class="button" :text="buttonText" @click="handlerButton" />
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import Popup from './Popup.vue';
import Button from './Button.vue';

interface Headers {
  text: string;
  subtext: string;
}

@Component({
  components: {
    Popup,
    Button,
  },
})
export default class NotificationPopup extends Vue {
  @Prop({ default: () => ({ text: '', subtext: '' }) }) headers!: Headers;
  @Prop({ default: false }) showButton!: boolean;
  @Prop({ default: true }) showWarningIcon!: boolean;
  @Prop(String) buttonText!: string;
  @Prop(String) sizeWidth!: string;
  @Prop(Function) handlerClose!: VoidFunction;
  @Prop(Function) handlerButton!: VoidFunction;

  get text() {
    return this.headers?.text ?? '';
  }

  get subtext() {
    return this.headers?.subtext ?? '';
  }

  get classesSubtext() {
    return ['subtext', `subtext-${this.sizeWidth}`];
  }
}
</script>

<style lang="scss" scoped>
.notification-popup {
  display: flex;
  flex-direction: column;
  align-items: center;

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
  }
}

.subtext {
  color: rgba(255, 255, 255, 0.5);
  line-height: 150%;
}

.subtext-medium {
  width: 255px;
}

.subtext-big {
  width: 300px;
}
</style>
