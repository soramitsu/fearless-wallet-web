<template>
  <!-- "Sound effects" (brand kit v3): the send and receive sounds. On by default; the extension has no haptics. -->
  <div class="sound-effects" data-testid="soundEffectsSetting">
    <span class="sound-effects__copy">
      <strong id="fw-sound-effects-label">{{ t('feel.soundEffects') }}</strong>
      <small>{{ t('feel.soundEffectsDescription') }}</small>
    </span>
    <Switcher :value="enabled" :ariaLabel="t('feel.soundEffects')" data-testid="soundEffectsSwitch" @change="choose" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import Switcher from '@/components/Switcher.vue';
import { useI18n } from '@/locales/useI18n';
import { onSoundEffectsChange, setSoundEffectsEnabled, soundEffectsEnabled } from '@/feel/soundPreference';

const { t } = useI18n();
const enabled = ref(soundEffectsEnabled());
const unsubscribe = onSoundEffectsChange((value) => (enabled.value = value));

onBeforeUnmount(unsubscribe);

const choose = (value: boolean) => setSoundEffectsEnabled(value);
</script>

<style lang="scss" scoped>
.sound-effects {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px 12px;
  border-top: $default-border;
  text-align: left;
}

.sound-effects__copy {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-width: 0;

  small {
    color: $grayish-white;
    font-size: 0.72rem;
  }
}
</style>
