<template>
  <div class="logo">
    <template v-if="showLogo">
      <ExternalLogo v-if="showWalletLogo && isTonWallet" class="brand-badge" :name="tonIcon" :width="parseInt(sizeCircle, 10)" />

      <img v-else class="brand-badge" :src="sunBadge" :style="styleCircle" alt="" />
    </template>

    <div v-if="text" class="text">{{ $t(text) }}</div>
    <div v-if="subtext" class="subtext">{{ $t(subtext) }}</div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useAccountsStore } from '@/stores/accounts';
import { TON_ICON } from '@/consts/networks';
import sunBadge from '@/assets/brand/winged-sun-badge-lines.svg';
import ExternalLogo from '@/components/ExternalLogo.vue';

type SizeLogo = 'mini' | 'small' | 'medium' | 'big';

interface Props {
  text?: string;
  subtext?: string;
  size?: SizeLogo;
  showLogo?: boolean;
  showWalletLogo?: boolean;
}

const tonIcon = TON_ICON;

const accountsStore = useAccountsStore();

const props = withDefaults(defineProps<Props>(), {
  size: 'medium',
  showLogo: true,
});

const circleSizes = {
  mini: '40px',
  small: '48px',
  medium: '72px',
  big: '96px',
};

const isTonWallet = computed(() => accountsStore.selectedWallet.isTon);

const sizeCircle = computed(() => circleSizes[props.size] ?? circleSizes.medium);

const styleCircle = computed(() => ({ height: sizeCircle.value, width: sizeCircle.value }));

</script>

<style lang="scss" scoped>
.logo {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;

  .brand-badge {
    display: block;
    flex-shrink: 0;
    margin: 0 auto;
    user-select: none;
  }

  .text {
    overflow-wrap: anywhere;
    margin-top: 17px;
    font-weight: 700;
    font-size: 3em;
    line-height: 120%;
  }

  .subtext {
    overflow-wrap: anywhere;
    font-size: 1.125em;
    line-height: 150%;
    margin-top: 6px;
  }
}

.fw-web {
  .text {
    font-size: 2rem;
  }

  .subtext {
    font-size: 1rem;
  }
}
</style>
