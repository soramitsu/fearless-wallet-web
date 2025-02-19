<template>
  <AboveForm :fullScreen="true" :showBackIcon="true" @handlerBack="close" @closeHandler="close">
    <div>
      <div
        v-for="wallet in wallets"
        class="wallet"
        @click="$emit('onSelect', wallet.ethereumAddress)"
        :key="wallet.address"
      >
        <Icon icon="wallet-logo-transaction" class="wallet__logo" />
        <span class="wallet__name">{{ wallet.name }}</span>
        <span class="wallet__address">{{ wallet.ethereumAddress }}</span>
        <Icon v-show="isSelected(wallet.ethereumAddress)" icon="check" class="wallet__icon" iconColor="purple" />
      </div>
    </div>
  </AboveForm>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { useAccountsStore } from '@/stores/accounts';

const props = defineProps<{
  selectedAddress: string;
}>();

const emit = defineEmits(['onSelect', 'onClose']);

const accountsStore = useAccountsStore();
const wallets = ref(accountsStore.accounts.filter((el) => el.ethereumAddress && !el.isMobile));

const close = () => emit('onClose');
const isSelected = (address: string) => address === props.selectedAddress;
</script>
<style lang="scss" scoped>
.icon {
  width: 24px;
  height: 24px;
}

.wallet {
  display: grid;
  grid-template-columns: 24px max-content 3fr;
  grid-template-rows: 1fr;
  grid-template-areas:
    'logo name chevron'
    'logo address chevron';
  place-items: center;
  padding: 16px;
  column-gap: 10px;
  cursor: pointer;

  &__name {
    grid-area: name;
    font-size: 1em;
    color: $default-white;
    line-height: 22px;
    place-self: flex-start;
  }

  &__address {
    grid-area: address;
    color: $gray-color;
    font-size: 0.75rem;
    line-height: 16px;
    place-self: flex-start;
  }

  &__logo {
    grid-area: logo;
    width: 24px;
    height: 24px;
  }

  &__icon {
    grid-area: chevron;
    place-self: center flex-end;
    width: 18px;
    height: 18px;
  }
}
</style>
