<template>
  <!-- The Yatagarasu tagline: letter-spaced Sora between two gold rules, as on the brand's welcome screen. -->
  <component :is="as" class="brand-signature" :class="{ animated }">
    <span class="signature-rule" aria-hidden="true"></span>
    <span class="signature-text">{{ text }}</span>
    <span class="signature-rule" aria-hidden="true"></span>
  </component>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ text: string; animated?: boolean; as?: string }>(), { as: 'p', animated: false });
</script>

<style scoped lang="scss">
.brand-signature {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  max-width: 100%;
  margin: 10px auto 0;
  color: var(--fw-text-1);
  // Localised titles render here too, so the hieroglyph and cuneiform fonts back the display face.
  font-family: 'Sora Variable', 'Noto Sans Egyptian Hieroglyphs', 'Noto Sans Cuneiform', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
  letter-spacing: 0.32em;
  text-align: center;
  text-transform: uppercase;
}

.signature-rule {
  flex: 0 0 28px;
  height: 1px;
  background: $fw-brand-gold;
}

.signature-text {
  min-width: 0;
  overflow-wrap: anywhere;
}

.brand-signature.animated {
  animation: signature-arrival 700ms var(--fw-ease) 1 both;
}

@keyframes signature-arrival {
  from { opacity: 0; letter-spacing: 0.5em; }
  to { opacity: 1; letter-spacing: 0.32em; }
}

@media (prefers-reduced-motion: reduce), (forced-colors: active) {
  .brand-signature.animated { animation: none; }
}

html[data-fw-effects='reduced'] .brand-signature.animated,
.fw-calm .brand-signature.animated { animation: none; }

@media (forced-colors: active) {
  .signature-rule { background: CanvasText; }
}
</style>
