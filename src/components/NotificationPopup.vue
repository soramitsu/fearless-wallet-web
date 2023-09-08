<template>
  <Popup
    :showHeader="showHeader"
    @handlerClose="$emit('handlerClose')"
    :sizeWidth="sizeWidth"
    :showBorder="true"
    :closeBuBackground="closeBuBackground"
    :zIndex="zIndex"
  >
    <div class="notification-popup-content">
      <Icon v-if="showWarningIcon" icon="info-triangle" className="img" />

      <div class="text">{{ $t(text) }}</div>
      <div v-if="subtext" :class="classesSubtext">{{ $t(subtext) }}</div>

      <slot></slot>

      <FButton
        v-if="showAcceptButton"
        class="button"
        size="medium"
        :text="acceptButtonText"
        @click="$emit('handlerAccept')"
      />

      <BorderButton
        v-if="showRejectButton"
        class="button reject-button"
        size="medium"
        :text="rejectButtonText"
        @click="$emit('handlerClose')"
      />
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

interface Headers {
  text: string;
  subtext: string;
}

type Size = 'mini' | 'small' | 'medium' | 'big';

@Component
export default class NotificationPopup extends Vue {
  @Prop({ default: () => ({ text: '', subtext: '' }) }) headers!: Headers;
  @Prop({ default: false }) showAcceptButton!: boolean;
  @Prop({ default: false }) showRejectButton!: boolean;
  @Prop({ default: true }) showWarningIcon!: boolean;
  @Prop({ default: true }) showHeader!: boolean;
  @Prop({ default: true }) closeBuBackground!: boolean;
  @Prop({ default: 'medium' }) sizeWidth!: Size;
  @Prop({ default: 'common.cancel' }) rejectButtonText!: string;
  @Prop({ default: 'common.proceed' }) acceptButtonText!: string;
  @Prop({ default: 299 }) zIndex!: number;

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
.notification-popup-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 10px;

  .img {
    margin-bottom: 10px;
    width: 42px;
    height: 42px;
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
  width: 325px;
}
</style>
