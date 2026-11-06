<template>
  <!-- One row of chips under the search: All, then the networks the wallet holds something on, largest first. A chip
       narrows the one list to that network; picking it again shows every network. -->
  <div
    ref="scroller"
    class="network-filter"
    :class="{ 'network-filter--more-before': moreBefore, 'network-filter--more-after': moreAfter }"
    role="group"
    :aria-label="labels.group"
    data-testid="networkFilter"
    @wheel="onWheel"
    @scroll.passive="measureEdges"
  >
    <button
      type="button"
      class="chip"
      :aria-pressed="allSelected"
      data-testid="networkFilterAll"
      @click="emit('select', ALL_NETWORKS)"
    >
      {{ labels.all }}
    </button>

    <!-- A group chosen in the full network list (Popular, Favorites) stays in sight; it opens that list again. -->
    <button
      v-if="groupLabel"
      type="button"
      class="chip"
      aria-pressed="true"
      data-testid="networkFilterGroup"
      @click="emit('more')"
    >
      {{ groupLabel }}
    </button>

    <button
      v-for="option in options"
      :key="option.name"
      type="button"
      class="chip"
      :aria-pressed="isSelected(option.name)"
      :data-network="option.name"
      data-testid="networkFilterChip"
      @click="toggle(option.name)"
    >
      <ExternalLogo :name="option.icon" :width="16" class="chip-logo" />
      <span>{{ option.name }}</span>
    </button>

    <button v-if="showMore" type="button" class="chip chip--more" data-testid="networkFilterMore" @click="emit('more')">
      {{ labels.more }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ALL_NETWORKS } from '@/consts/networks';
import { isSameString } from '@/helpers';

export interface NetworkFilterOption {
  name: string;
  icon: string;
}

/** The row's words, translated by the screen that shows it. */
export interface NetworkFilterLabels {
  /** What the row of chips is, for assistive technology. */
  group: string;
  all: string;
  more: string;
}

const props = withDefaults(
  defineProps<{
    /** The networks to offer, in order; the caller includes a selected network that holds nothing. */
    options: NetworkFilterOption[];
    labels: NetworkFilterLabels;
    /** `ALL_NETWORKS`, a network group (Popular, Favorites) or one network's name. */
    selected: string;
    /** The name of the selected group, when the filter is a group rather than one network. */
    groupLabel?: string;
    /** A last chip that opens the full network list. */
    showMore?: boolean;
  }>(),
  { groupLabel: '', showMore: false }
);

const emit = defineEmits<{
  (event: 'select', network: string): void;
  (event: 'more'): void;
}>();

const scroller = ref<HTMLElement | null>(null);
/** Chips cut off before or after the visible part: that edge fades out. */
const moreBefore = ref(false);
const moreAfter = ref(false);
let resizeObserver: ResizeObserver | undefined;

const allSelected = computed(() => isSameString(props.selected, ALL_NETWORKS));
const isSelected = (name: string): boolean => isSameString(name, props.selected);

function toggle(name: string): void {
  emit('select', isSelected(name) ? ALL_NETWORKS : name);
}

// A mouse wheel moves the row sideways while it can, so every chip is in reach without a trackpad; at either end the
// page scrolls as usual.
function onWheel(event: WheelEvent): void {
  const row = scroller.value;
  if (!row || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

  const end = row.scrollWidth - row.clientWidth;
  const next = Math.min(end, Math.max(0, row.scrollLeft + event.deltaY));
  if (end <= 0 || next === row.scrollLeft) return;

  row.scrollLeft = next;
  event.preventDefault();
}

// The chosen chip is scrolled into the row's view, wherever it sits; the page itself never moves for it.
function revealSelected(): void {
  void nextTick(() => {
    const row = scroller.value;
    const chip = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!row || !chip) return;

    const start = chip.offsetLeft;
    const finish = start + chip.offsetWidth;

    if (start < row.scrollLeft) row.scrollLeft = Math.max(0, start - 8);
    else if (finish > row.scrollLeft + row.clientWidth) row.scrollLeft = finish - row.clientWidth + 8;
    measureEdges();
  });
}

function measureEdges(): void {
  const row = scroller.value;
  if (!row) return;

  moreBefore.value = row.scrollLeft > 1;
  moreAfter.value = row.scrollLeft + row.clientWidth < row.scrollWidth - 1;
}

watch(() => props.selected, revealSelected);
watch(
  () => props.options,
  () => void nextTick(measureEdges)
);
onMounted(() => {
  revealSelected();
  void nextTick(measureEdges);
  if (typeof ResizeObserver === 'undefined' || !scroller.value) return;

  resizeObserver = new ResizeObserver(measureEdges);
  resizeObserver.observe(scroller.value);
});
onBeforeUnmount(() => resizeObserver?.disconnect());
</script>

<style lang="scss" scoped>
.network-filter {
  position: relative;
  display: flex;
  gap: 6px;
  min-width: 0;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.network-filter--more-after {
  mask-image: linear-gradient(to right, black calc(100% - 32px), transparent);
}

.network-filter--more-before {
  mask-image: linear-gradient(to left, black calc(100% - 32px), transparent);
}

.network-filter--more-before.network-filter--more-after {
  mask-image: linear-gradient(to right, transparent, black 32px, black calc(100% - 32px), transparent);
}

.chip {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 12px;
  border: $default-border;
  border-radius: 16px;
  background: $secondary-background-color;
  color: $grayish-white;
  font: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;

  &:hover {
    color: $plain-white;
  }

  &[aria-pressed='true'] {
    border-color: palette($pink-lavender-color, var(--fw-select-edge));
    background: $pink-purple-color;
    color: $plain-white;
  }

  // Inside the chip: the row clips anything drawn outside it.
  &:focus-visible {
    outline: 2px solid palette($pink-lavender-color, var(--fw-focus));
    outline-offset: -2px;
  }
}

.chip-logo {
  flex: none;
  border-radius: 50%;
}

.chip--more {
  border-style: dashed;
}
</style>
