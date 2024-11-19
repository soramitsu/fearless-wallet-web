<template>
  <li class="network" data-testid="networkItem" :class="!isAvailable ? 'unavailable' : ''" @click="onSelect">
    <Icon v-if="isNetworkGroup" icon="all-networks" width="24" height="24" className="network__icon" />
    <ExternalLogo v-else :name="network.icon" :width="24" class="img" />

    <span class="network__name" data-testid="networkName">{{ network.name }}</span>

    <div class="network__state" data-testid="isNetworkSelected">
      <Icon
        v-if="isNetworkSelected"
        icon="check"
        :iconColor="iconColor"
        width="18"
        height="18"
        className="network__icon-state"
      />

      <div data-testid="isNetworkFavorite" @click.stop="onToggleState">
        <Icon :icon="iconType" :iconColor="iconColorFavorite" width="18" height="18" className="network__icon-state" />
      </div>
    </div>
  </li>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { NetworkJson } from '@extension-base/types';
import type { SelectedWallet } from '@/store/accounts/types';
import { useAccountsStore } from '@/stores/accounts';

type Props = {
  network: NetworkJson;
  isSelected: boolean;
  isAvailable: boolean;
  isNetworkGroup?: boolean;
};

const props = withDefaults(defineProps<Props>(), { isNetworkGroup: false });
const accountsStore = useAccountsStore();
const emit = defineEmits(['onToggleFavorite', 'onChangeNetwork']);

const selectedWallet = computed<SelectedWallet>(() => accountsStore.selectedWallet);

const iconColor = computed(() => (props.isSelected ? 'purple' : ''));
const iconType = computed(() => (props.isNetworkGroup ? 'check' : 'star'));

const isNetworkSelected = computed(() => props.isSelected && !props.isNetworkGroup);

const isFavorite = computed(() => {
  if (props.isNetworkGroup) return false;

  return props.network.favorite.includes(selectedWallet.value.address);
});

const iconColorFavorite = computed(() =>
  isFavorite.value || (props.isSelected && props.isNetworkGroup) ? 'purple' : ''
);

const onSelect = () => {
  if (!props.isAvailable) return;

  emit('onChangeNetwork');
};

const onToggleState = () => {
  if (props.isNetworkGroup) {
    onSelect();

    return;
  }

  emit('onToggleFavorite');
};

const prepColor = computed(() => {
  if (!props.isAvailable) return 'rgba(255, 255, 255, 0.5)'; //gray-color

  return 'rgba(255, 255, 255, 1)'; //default-white
});

const prepOpacity = computed(() => (props.isAvailable ? '1' : '0.5'));
</script>

<style lang="scss" scoped>
.network {
  display: flex;
  flex-flow: row nowrap;
  color: v-bind(prepColor);
  font-size: 16px;
  border: solid 1px transparent;
  border-bottom-color: $default-background-color;
  padding-top: 16px;
  padding-bottom: 16px;
  justify-content: center;
  align-items: center;
  gap: 16px;

  &__name {
    white-space: nowrap;
  }

  &__icon-state {
    width: 18px;
    height: 18px;
  }

  &__icon {
    width: 24px;
    height: 24px;
  }

  &__state {
    flex-grow: 3;
    width: 100%;
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }
}

.img {
  opacity: v-bind(prepOpacity);
}
</style>
