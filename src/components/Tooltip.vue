<template>
  <div class="tooltip"></div>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, onMounted, shallowRef, toRefs, watchEffect } from 'vue';
import tippy from 'tippy.js';
import { useI18n } from 'vue-i18n';
import type { Placement, ComponentText } from '@/interfaces';
import type { Props, Instance } from 'tippy.js';

type PropsDefinition = {
  text?: ComponentText;
  target?: string;
  targetElement?: HTMLElement | null;
  placement?: Placement;
  arrow?: boolean;
  maxWidth?: number;
  delay?: number;
  trigger?: string;
};

defineOptions({
  name: 'Tooltip',
});

const rawProps = withDefaults(defineProps<PropsDefinition>(), {
  text: '',
  target: '',
  placement: 'top',
  arrow: false,
  maxWidth: 250,
  delay: 1500,
});

const { t, locale } = useI18n();
const { text, target, targetElement, placement, arrow, maxWidth, delay, trigger } = toRefs(rawProps);

const tooltips = shallowRef<Instance<Props>[]>([]);
const isMounted = shallowRef(false);

const destroyTooltips = () => {
  tooltips.value.forEach((item) => item.destroy());
  tooltips.value = [];
};

const resolveContent = () => {
  if (typeof text.value === 'string') return text.value ? t(text.value) : '';

  return t(text.value.text, text.value.localeProps);
};

watchEffect((onCleanup) => {
  void locale.value;

  if (!isMounted.value) return;

  const resolvedTargets = (): Element[] => {
    if (typeof window === 'undefined') return [];

    if (targetElement?.value) {
      return targetElement.value ? [targetElement.value] : [];
    }

    if (!target.value) return [];

    return Array.from(document.querySelectorAll(target.value));
  };

  const nodes = resolvedTargets();

  if (!nodes.length) {
    destroyTooltips();

    return;
  }

  const currentTrigger = trigger?.value;
  const options: Partial<Props> = {
    content: resolveContent(),
    placement: placement.value,
    arrow: arrow.value,
    animation: 'shift-toward-extreme',
    delay: [delay.value, 0],
    duration: 0,
    maxWidth: maxWidth.value,
    allowHTML: true,
    appendTo: () => document.body,
    trigger: currentTrigger ?? 'mouseenter focus',
    hideOnClick: currentTrigger === 'click',
    onShow(instance) {
      if (currentTrigger === 'click') {
        setTimeout(() => {
          instance.hide();
        }, 1000);
      }
    },
  };

  if (currentTrigger) {
    options.delay = 0;
  }

  const instances = nodes.flatMap((node) => {
    const instance = tippy(node, options);

    return Array.isArray(instance) ? instance : [instance];
  });

  tooltips.value = instances;

  onCleanup(() => {
    destroyTooltips();
  });
});

onMounted(() => {
  isMounted.value = true;
});

onBeforeUnmount(() => {
  isMounted.value = false;
  destroyTooltips();
});
</script>
