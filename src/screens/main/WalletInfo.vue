<template>
  <FCorners size="big">
    <div :class="contentClasses" data-testid="walletInfo" @click="setWallet">
      <div class="content" data-testid="content">
        <div class="name" data-testid="name">{{ name }}</div>

        <WalletBalance class="balance" :balance="balance" :changeWalletBalance="changeWalletBalance" />
      </div>

      <Icon v-if="isMobile" icon="mobile" className="mobile" />

      <div v-if="showMenu" ref="dotsHorizontalRef" class="dots-container" data-testid="dots">
        <Icon icon="dots-horizontal" className="dots" />
      </div>
    </div>
  </FCorners>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { ResponseTotalBalances } from '@extension-base/background/types/types';

import { type CustomEvent } from '@/interfaces';
import WalletBalance from '@/screens/main/WalletBalance.vue';
import { getTotalBalances } from '@/extension/messaging';

defineOptions({
  name: 'WalletInfo',
});

const props = withDefaults(
  defineProps<{
    name: string;
    address: string;
    isMobile?: boolean;
    isSelected?: boolean;
    showMenu?: boolean;
  }>(),
  {
    name: '',
    address: '',
    isMobile: false,
    isSelected: false,
    showMenu: true,
  }
);

const emit = defineEmits<{
  setWallet: [];
  setShowWalletDetailsPopupVisible: [buttonTop: number];
}>();

const totalBalances = ref<ResponseTotalBalances[]>([]);
const intervalId = ref<ReturnType<typeof setInterval> | null>(null);
const dotsHorizontalRef = ref<HTMLDivElement | null>(null);

const totalBalance = computed(() => totalBalances.value.find(({ address }) => address === props.address));

const balance = computed(() => totalBalance.value?.total ?? 0);

const changeWalletBalance = computed(() => totalBalance.value?.change ?? { percent: 0, amount: 0 });

const contentClasses = computed(() => [
  'wallet-info',
  {
    'is-selected': props.isSelected,
  },
]);

const loadBalances = async () => {
  totalBalances.value = await getTotalBalances();
};

onMounted(async () => {
  await loadBalances();

  intervalId.value = setInterval(loadBalances, 5000);
});

onBeforeUnmount(() => {
  if (intervalId.value) clearInterval(intervalId.value);
});

const setWallet = (event: CustomEvent | MouseEvent) => {
  const target = (event.target as HTMLElement | null) ?? null;

  if (!target) return;

  const classList = target.classList;
  const shouldUpdateSelectedWallet = !(
    classList.contains('dots-container') ||
    classList.contains('dots') ||
    classList.contains('dots-horizontal') ||
    classList.contains('icon__inner')
  );

  if (shouldUpdateSelectedWallet) {
    emit('setWallet');
  } else if (dotsHorizontalRef.value) {
    const buttonTop = dotsHorizontalRef.value.getBoundingClientRect().top;

    emit('setShowWalletDetailsPopupVisible', buttonTop);
  }
};
</script>

<style lang="scss" scoped>
.wallet-info {
  display: flex;
  gap: 8px;
  align-items: center;
  text-align: left;
  opacity: 0.9;
  border: $default-border;
  padding: 10px $default-padding;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border: $default-border;
  border-radius: $default-border-radius;
  background: $secondary-background-color;
  user-select: none;
  cursor: pointer;

  &:hover {
    opacity: 1;
  }

  .content {
    min-height: 45px; // TODO: delete after adding percent
    flex-grow: 1;
  }

  .name {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    color: $gray-color;
    margin-bottom: 4px;
    max-width: 185px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile {
    width: 18px;
    height: 18px;
  }

  .s-icon-basic-check-mark-24 {
    color: $pink-lavender-color;
  }

  .dots-container {
    height: 25px;
    width: 25px;
    opacity: 0.9;
    display: flex;

    &:hover {
      opacity: 1;
    }

    .dots {
      margin: auto;
      height: 20px;
      width: 20px;
    }
  }

  .balance {
    font-size: 1.125em;
    line-height: 22px;
  }
}

.is-selected {
  background: $pink-purple-color;
}
</style>
