<template>
  <Popup
    :showHeader="showHeader"
    :sizeWidth="sizeWidth"
    :showBorder="true"
    :closeByBackground="closeByBackground"
    :zIndex="zIndex"
    @handlerClose="emit('handlerClose')"
  >
    <div class="notification-popup-content">
      <Icon v-if="showWarningIcon" icon="info-triangle" className="img" />

      <div class="text" data-testid="notificationText">{{ $t(text) }}</div>
      <div v-if="subtext" :class="classesSubtext" data-testid="notificationSubtext">{{ $t(subtext) }}</div>

      <slot></slot>

      <FButton
        v-if="showAcceptButton"
        class="button"
        :text="acceptButtonText"
        data-testid="acceptBtn"
        @click="$emit('handlerAccept')"
      />

      <BorderButton
        v-if="showRejectButton"
        class="button reject-button"
        :text="rejectButtonText"
        data-testid="closeBtn"
        @click="$emit('handlerClose')"
      />
    </div>
  </Popup>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

type Size = 'mini' | 'small' | 'medium' | 'big';

interface Props {
  headers?: { text: string; subtext: string };
  showAcceptButton?: boolean;
  showRejectButton?: boolean;
  showWarningIcon?: boolean;
  showHeader?: boolean;
  closeByBackground?: boolean;
  sizeWidth?: Size;
  rejectButtonText?: string;
  acceptButtonText?: string;
  zIndex?: number;
}

const props = withDefaults(defineProps<Props>(), {
  headers: () => ({ text: '', subtext: '' }),
  showAcceptButton: false,
  showRejectButton: false,
  showWarningIcon: true,
  showHeader: true,
  closeByBackground: true,
  sizeWidth: 'medium',
  rejectButtonText: 'common.cancel',
  acceptButtonText: 'common.proceed',
  zIndex: 299,
});

const emit = defineEmits(['handlerClose', 'handlerAccept']);

const text = computed(() => props.headers.text);
const subtext = computed(() => props.headers.subtext);
const classesSubtext = computed(() => ['subtext', `subtext-${props.sizeWidth}`]);
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
