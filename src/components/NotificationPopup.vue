<template>
  <Popup :handlerClose="handlerClose" sizeWidth="medium" :showBorder="true">
    <div class="notification-popup">
      <img src="@/assets/info-triangle.svg" />

      <div class="text">{{ text }}</div>
      <div class="subtext">{{ subtext }}</div>

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
  @Prop(String) buttonText!: string;
  @Prop(Function) handlerClose!: VoidFunction;
  @Prop(Function) handlerButton!: VoidFunction;

  get text() {
    return this.headers?.text ?? '';
  }

  get subtext() {
    return this.headers?.subtext ?? '';
  }
}
</script>

<style lang="scss" scoped>
.notification-popup {
  display: flex;
  flex-direction: column;
  align-items: center;

  .text {
    font-weight: 700;
    font-size: 18px;
    line-height: 150%;
    margin: 20px 0 4px;
  }

  .subtext {
    color: rgba(255, 255, 255, 0.5);
    width: 255px;
    line-height: 150%;
  }

  .button {
    margin-top: 20px;
    width: 150px;
  }
}
</style>
