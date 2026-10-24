<template>
  <div class="qr-wrapper">
    <img v-if="qr" :src="qr" :class="qrClasses" alt="" />

    <Icon v-if="showLogo" className="logo-qr" icon="logo-qr" :hover="false" />
  </div>
</template>

<script lang="ts" setup>
import QRCode from 'qrcode';
import { watch, ref, computed } from 'vue';

type Props = {
  payload?: string;
  margin?: number;
  width?: number;
  foreground?: string;
  background?: string;
  showLogo?: boolean;
};
const qr = ref('');
const props = withDefaults(defineProps<Props>(), {
  margin: 5,
  width: 300,
  foreground: '#111111',
  background: '#FFFFFF',
  showLogo: false,
});

const qrClasses = computed(() => {
  return [
    'qr-code',
    {
      'qr-code-margin': props.showLogo,
    },
  ];
});

let request = 0;
const createQR = async () => {
  const current = ++request;
  const payload = props.payload;
  qr.value = '';
  if (!payload) return;

  const image = await QRCode.toDataURL(payload, {
    margin: props.margin,
    width: props.width,
    maskPattern: 5,
    errorCorrectionLevel: 'M',
    color: {
      dark: props.foreground,
      light: props.background,
    },
  });
  if (current === request) qr.value = image;
};

watch(
  () => props.payload,
  () => createQR(),
  { immediate: true }
);
</script>

<style lang="scss" scoped>
.qr-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;

  .qr-code {
    border-radius: 24px;
  }

  .qr-code-margin {
    border-radius: 24px;
  }

  .logo-qr {
    position: absolute;
    color: $pink-color;
    width: 65px;
    height: 30px;
  }
}
</style>
