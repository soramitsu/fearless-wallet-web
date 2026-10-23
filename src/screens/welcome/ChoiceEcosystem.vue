<template>
  <div class="wallet-ecosystem">
    <button class="ecosystem-option" type="button" data-testid="substrateEcosystem" @click="setEcosystem('substrate')">
      <strong>{{ $t('ux.primaryNetworks') }}</strong>
      <span>{{ $t('ux.primaryNetworksDescription') }}</span>
      <span class="ecosystem-action">{{ $t('common.continue') }} →</span>
    </button>
    <button class="ecosystem-option" type="button" data-testid="tonEcosystem" @click="setEcosystem('ton')">
      <strong>{{ $t('ux.tonNetwork') }}</strong>
      <span>{{ $t('ux.tonNetworkDescription') }}</span>
      <span class="ecosystem-action">{{ $t('common.continue') }} →</span>
    </button>
  </div>
</template>

<script lang="ts" setup>
import { type WalletEcosystem } from '@/interfaces';
const emit = defineEmits(['setEcosystem']);
const setEcosystem = (ecosystem: WalletEcosystem) => emit('setEcosystem', ecosystem);
</script>

<style lang="scss" scoped>
.wallet-ecosystem {
  display: grid;
  gap: 12px;
}
.ecosystem-option {
  display: grid;
  gap: 8px;
  padding: 20px;
  border: $default-border;
  border-radius: 8px;
  background: $secondary-background-color;
  text-align: left;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.ecosystem-option strong {
  font-size: 1.125rem;
}
.ecosystem-option span {
  font-size: 0.875rem;
  color: $default-white;
  line-height: 1.5;
}
.ecosystem-option .ecosystem-action {
  color: $pink-lavender-color;
  margin-top: 8px;
}
.ecosystem-option:hover {
  border-color: $pink-lavender-color;
}
</style>
