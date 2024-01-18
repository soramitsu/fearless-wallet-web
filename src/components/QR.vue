<template>
  <div class="qr-wrapper">
    <img :src="qr" :class="qrClasses" />

    <Icon v-if="showLogo" className="logo-qr" icon="logo-qr" :hover="false" />
  </div>
</template>

<script lang="ts" setup>
import QRCode from 'qrcode';
import { watch, onMounted, ref, computed } from 'vue';

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

const createQR = async () => {
  if (!props.payload) return;

  qr.value = await QRCode.toDataURL(props.payload, {
    margin: props.margin,
    width: props.width,
    maskPattern: 5,
    errorCorrectionLevel: 'M',
    color: {
      dark: props.foreground,
      light: props.background,
    },
  });
};

onMounted(() => createQR());

watch(
  () => props.payload,
  () => createQR()
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
