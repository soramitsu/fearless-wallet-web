<template>
  <section class="visual-effects" data-testid="visualEffectsSetting">
    <h2>{{ t('settingsPage.groups.appearance') }}</h2>
    <fieldset>
      <legend>{{ t('settingsPage.visualEffects.title') }}</legend>
      <!-- Native radios: arrow keys move the choice, and a screen reader hears one choice of three. -->
      <div class="segmented">
        <label v-for="option in options" :key="option" class="segment" :data-testid="`visualEffects-${option}`">
          <input
            type="radio"
            name="fw-visual-effects"
            :value="option"
            :checked="state.preference === option"
            @change="choose(option)"
          />
          <span>{{ t(`settingsPage.visualEffects.${option}`) }}</span>
        </label>
      </div>
      <p class="hint" data-testid="visualEffectsDescription">
        {{ t(`settingsPage.visualEffects.${state.preference}Description`) }}
      </p>
      <p class="hint" role="status" data-testid="visualEffectsInUse">
        {{ t('settingsPage.visualEffects.inUse', { mode: t(`settingsPage.visualEffects.${state.effects}`) }) }}
      </p>
      <p v-if="keptReduced" class="hint" data-testid="visualEffectsContrastNote">
        {{ t('settingsPage.visualEffects.contrastNote') }}
      </p>
    </fieldset>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef } from 'vue';
import { useI18n } from '@/locales/useI18n';
import { VISUAL_EFFECTS_PREFERENCES, visualEffects, type VisualEffectsPreference } from '@/appearance/visualEffects';

const { t } = useI18n();
const effects = visualEffects();
const options = VISUAL_EFFECTS_PREFERENCES;
const state = shallowRef(effects.state);
const unsubscribe = effects.subscribe((next) => (state.value = next));

onBeforeUnmount(unsubscribe);

// The system's contrast settings keep the paint Reduced whatever was picked (design-system 2.1).
const keptReduced = computed(
  () => state.value.preference !== 'reduced' && (state.value.signals.moreContrast || state.value.signals.forcedColors)
);

const choose = (preference: VisualEffectsPreference) => {
  effects
    .choose(preference)
    .catch((error) => console.warn('The visual effects choice applies now but was not saved', error));
};
</script>

<style lang="scss" scoped>
.visual-effects {
  padding: 16px 16px 4px;
  border-top: $default-border;
  text-align: left;

  h2 {
    margin: 0 0 8px;
    color: $gray-color;
    font-size: 0.68rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
}

fieldset {
  margin: 0;
  padding: 8px 0 12px;
  border: 0;
  border-top: $default-border;
}

legend {
  float: left;
  width: 100%;
  margin-bottom: 8px;
  padding: 0;
  font-weight: 700;
}

.segmented {
  clear: both;
  display: flex;
  padding: 2px;
  border: $default-border;
  border-radius: 24px;
  background: $secondary-background-color;
}

.segment {
  position: relative;
  flex: 1 1 0;
  min-width: 0;

  input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  span {
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 8px;
    border-radius: 22px;
    color: $grayish-white;
    font-size: 0.8rem;
    text-align: center;
    overflow-wrap: break-word;
  }

  input:checked + span {
    background: $pink-purple-color;
    color: $plain-white;
    font-weight: 700;
  }

  input:focus-visible + span {
    outline: 2px solid var(--fw-focus);
    outline-offset: 2px;
  }
}

.hint {
  margin: 8px 0 0;
  color: $grayish-white;
  font-size: 0.72rem;
}
</style>
