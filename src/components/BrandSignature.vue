<template>
  <span class="brand-signature" :class="{ animated }" role="img" :aria-label="t('common.fearlessWallet')">
    <Icon icon="fearless-cuneiform" className="signature-base" :hover="false" />
    <Icon icon="fearless-cuneiform" className="signature-echo signature-cyan" :hover="false" />
    <Icon icon="fearless-cuneiform" className="signature-echo signature-pink" :hover="false" />
  </span>
</template>

<script setup lang="ts">
import Icon from '@/components/Icon.vue';
import { useI18n } from '@/locales/useI18n';

defineProps<{ animated?: boolean }>();
const { t } = useI18n();
</script>

<style scoped lang="scss">
.brand-signature {
  display: block;
  position: relative;
  width: 132px;
  max-width: 100%;
  aspect-ratio: 3827 / 1183;
  margin: 12px auto;
  color: var(--fw-text-1);

  :deep(svg) {
    display: block;
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .signature-base {
    filter: drop-shadow(0 0 8px rgb(221 189 124 / 0.3));
  }

  .signature-echo {
    position: absolute;
    inset: 0;
    opacity: 0;
    pointer-events: none;
  }

  .signature-cyan {
    color: #38e8e0;
    clip-path: inset(15% 0 60%);
  }

  .signature-pink {
    color: #ee0077;
    clip-path: inset(65% 0 10%);
  }

  &.animated .signature-cyan {
    animation: signature-arrival 1000ms ease-out 1;
  }

  &.animated .signature-pink {
    animation: signature-arrival 1000ms ease-out 1 reverse;
  }
}

@keyframes signature-arrival {
  0%, 100% { opacity: 0; transform: translateX(0); }
  20% { opacity: 0.5; transform: translateX(2px); }
  45% { opacity: 0; transform: translateX(-1px); }
}

@media (prefers-reduced-motion: reduce), (forced-colors: active) {
  .brand-signature.animated .signature-echo { animation: none; }
}

html[data-fw-effects='reduced'] .brand-signature.animated .signature-echo,
.fw-calm .brand-signature.animated .signature-echo { animation: none; }
.fw-calm .brand-signature .signature-base { filter: none; }
</style>
