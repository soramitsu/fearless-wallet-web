<script setup lang="ts">
const props = defineProps<{
  href?: string;
  title?: string;
  icon?: string;
  small?: boolean;
  xsSmall?: boolean;
  accent?: boolean;
  target?: "_blank" | "_self";
}>();

const component = computed(() => {
  if (props.href) return resolveComponent("NuxtLink");

  return "button";
});

const classComponent = computed(() => {
  const classes = [
    "button",
    {
      accent: props.accent,
      "text-s bold px-m py-s": !props.xsSmall && !props.small,
      "text-xs px-3xs py-2xs": props.xsSmall,
      "text-xxs px-s py-xs": props.small,
    },
  ];

  return classes;
});
</script>

<template>
  <component
    :href="href"
    :is="component"
    :class="classComponent"
    :target="target"
  >
    <span class="shape" />

    <img
      v-if="icon"
      :src="`/icons/${icon}.svg`"
      :alt="`${icon} icon`"
      class="icon"
    />

    <span v-if="title">{{ title }}</span>
  </component>
</template>

<style scoped>
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  position: relative;
  color: var(--color-text-primary);
}

.button > * {
  position: relative;
}

.icon {
  width: 1.3em;
  height: 1.3em;
}

.shape {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
  pointer-events: none;
  opacity: 0.1;
}

.shape::before,
.shape::after {
  content: "";
  position: absolute;
  top: 0;
  height: 100%;
  width: 55%;
  background-image: url("/elements/button.svg");
  background-size: auto 100%;
  background-repeat: no-repeat;
}

.shape::before {
  left: 0;
  background-position: 0 center;
}

.shape::after {
  right: 0;
  background-position: 100% center;
}

.button.accent .shape {
  opacity: 1;
}

.button.accent .shape::before,
.button.accent .shape::after {
  background-image: url("/elements/button-accent.svg");
}

@media (hover: hover) {
  .shape {
    transition: opacity 0.3s ease;
  }

  .button:hover .shape {
    opacity: 0.15;
  }

  .button.accent:hover .shape {
    opacity: 0.8;
  }
}
</style>
