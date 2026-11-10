<template>
  <!-- The Yatagarasu on its rock: a muted 12 s loop; clicking the crow plays its call. Rendered from the brand's
       real-time model, framed for the 561x600 popup (crow and rock in the top 55 %). -->
  <div class="welcome-hero" :class="{ 'welcome-hero--still': still }" data-testid="welcomeHero">
    <img class="hero-layer" :src="poster" alt="" aria-hidden="true" draggable="false" />
    <video
      v-if="!still"
      ref="idle"
      class="hero-layer"
      :src="idleSrc"
      :poster="poster"
      muted
      loop
      autoplay
      playsinline
      preload="auto"
      disablepictureinpicture
      aria-hidden="true"
      tabindex="-1"
    ></video>
    <video
      ref="call"
      class="hero-layer hero-call-clip"
      :class="{ 'hero-call-clip--on': calling && !still }"
      :src="callSrc"
      playsinline
      preload="auto"
      disablepictureinpicture
      aria-hidden="true"
      tabindex="-1"
      @ended="calling = false"
      @pause="calling = false"
    ></video>
    <button
      type="button"
      class="hero-crow"
      :aria-label="t('brand.playCall')"
      :disabled="calling"
      data-testid="welcomeHeroCall"
      @click="playCall"
    ></button>
    <button
      type="button"
      class="hero-sound"
      :aria-label="t('brand.callSound')"
      :aria-pressed="String(soundOn)"
      data-testid="welcomeHeroSound"
      @click="toggleSound"
    >
      <svg class="sound-on" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6" /><path d="M18.5 6.5a8 8 0 0 1 0 11" /></svg>
      <svg class="sound-off" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M16 9.5l5 5M21 9.5l-5 5" /></svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from '@/locales/useI18n';
import idleSrc from '@/assets/brand/hero/popup-idle.webm';
import callSrc from '@/assets/brand/hero/popup-caw.webm';
import poster from '@/assets/brand/hero/popup-poster.webp';

const SOUND_KEY = 'fearless-crow-call-sound';
const { t } = useI18n();
const idle = ref<HTMLVideoElement>();
const call = ref<HTMLVideoElement>();
const calling = ref(false);

// Reduced motion (the OS setting, or the wallet's own reduced effects and calm surfaces) keeps the still poster.
const motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const appReduced = () =>
  document.documentElement.dataset.fwEffects === 'reduced' || Boolean(document.querySelector('.fw-calm'));
const still = ref(Boolean(motionQuery?.matches) || appReduced());
const onMotionChange = () => (still.value = Boolean(motionQuery?.matches) || appReduced());

const readSound = () => {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
};
const soundOn = ref(readSound());

const toggleSound = () => {
  soundOn.value = !soundOn.value;
  try {
    localStorage.setItem(SOUND_KEY, soundOn.value ? 'on' : 'off');
  } catch {
    // Storage can be unavailable; the choice then lasts for this page only.
  }
  if (call.value) call.value.muted = !soundOn.value;
};

// The call only ever starts from a click, which is also what lets the browser play its sound.
const playCall = async () => {
  const clip = call.value;
  if (!clip || calling.value) return;
  clip.muted = !soundOn.value;
  clip.currentTime = 0;
  calling.value = true;
  try {
    await clip.play();
  } catch {
    calling.value = false;
  }
};

const onVisibility = () => {
  if (document.hidden) {
    idle.value?.pause();
    call.value?.pause();
  } else idle.value?.play().catch(() => undefined);
};

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility);
  motionQuery?.addEventListener('change', onMotionChange);
});

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility);
  motionQuery?.removeEventListener('change', onMotionChange);
  idle.value?.pause();
  call.value?.pause();
});
</script>

<style lang="scss" scoped>
.welcome-hero {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: $fw-brand-ink;
  // Sized by its parent, never by its content, so the frame below can follow the hero's shape.
  container-type: size;

  // The lower part fades into ink so the lockup and the actions over it stay legible.
  &::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 50%;
    background: linear-gradient(180deg, $fw-brand-ink-clear 0%, $fw-brand-ink-veil 28%, $fw-brand-ink 60%);
    pointer-events: none;
  }
}

.hero-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 0;
  pointer-events: none;
  user-select: none;
}

.hero-call-clip {
  opacity: 0;
  transition: opacity 250ms var(--fw-ease);

  &--on {
    opacity: 1;
  }
}

// The crow itself is the target: the upper middle of the frame, where the bird and its wings are.
.hero-crow {
  position: absolute;
  left: 50%;
  top: 2%;
  width: 56%;
  height: 52%;
  transform: translateX(-50%);
  border: 0;
  border-radius: 40%;
  background: transparent;
  cursor: pointer;
  z-index: 1;

  &:disabled {
    cursor: default;
  }

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: 4px;
  }
}

.hero-sound {
  position: absolute;
  top: 12px;
  right: 12px;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid $fw-brand-hairline;
  border-radius: 14px;
  background: $fw-brand-ink-glass;
  color: $fw-brand-on-ink;
  cursor: pointer;
  z-index: 1;

  &[aria-pressed='false'] {
    color: $fw-brand-on-ink-muted;
  }

  &[aria-pressed='false'] .sound-on,
  &[aria-pressed='true'] .sound-off {
    display: none;
  }

  &:focus-visible {
    outline: 2px solid var(--fw-focus);
    outline-offset: 2px;
  }
}

// Much taller than wide (the side panel): filling the height would enlarge the frame until a wingtip leaves the
// panel. The frame keeps its shape at 150 % of the width instead, which keeps both wingtips in view, and fades into the
// ink below. The crow target follows it.
@container (max-aspect-ratio: 1 / 2) {
  .hero-layer {
    left: -25%;
    width: 150%;
    height: auto;
    aspect-ratio: 561 / 600;
    mask-image: linear-gradient(180deg, black 72%, transparent 100%);
  }

  .hero-crow {
    top: 3cqw;
    width: 84%;
    height: 83cqw;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero-call-clip {
    transition: none;
  }
}

@media (forced-colors: active) {
  .hero-sound {
    border-color: ButtonText;
  }
}
</style>
