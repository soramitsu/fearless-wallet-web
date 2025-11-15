<template>
  <SelectPopup
    verticalPlacement="top"
    horizontalPlacement="right"
    placeholder="common.searchCurrency"
    :value="accountsStore.selectedFiat"
    :top="50"
    :showAnimation="showAnimation"
    :options="filteredOptionsFiats"
    @toggleValue="toggleSelectedFiat"
    @handlerClose="handleClose"
    @handlerFilter="handlerFilter"
  />
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { updateFiatSymbol } from '@/extension/messaging';
import { useAccountsStore } from '@/stores/accounts';
import { useWalletMetadata } from '@/composables/useWalletMetadata';

const accountsStore = useAccountsStore();
const filterValue = ref('');

const props = withDefaults(defineProps<{ showAnimation?: boolean }>(), {
  showAnimation: false,
});

const showAnimation = computed(() => props.showAnimation);

const emit = defineEmits<{
  handlerClose: [];
}>();

defineOptions({
  name: 'FiatsPopup',
});

const walletMetadata = useWalletMetadata(() => ({ fiatFilter: filterValue.value }));
const fiatMetadata = computed(() => walletMetadata.value.fiatMetadata);
const filteredOptionsFiats = computed(() => fiatMetadata.value.options);

const handlerFilter = (value: string) => {
  filterValue.value = value;
};

const handleClose = () => emit('handlerClose');

const toggleSelectedFiat = (id: string) => {
  updateFiatSymbol(id).then(() => {
    accountsStore.setSelectedFiat(id);
    handleClose();
  });
};
</script>

<style lang="scss" scoped>
.main {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: $default-height-page;
}
</style>
