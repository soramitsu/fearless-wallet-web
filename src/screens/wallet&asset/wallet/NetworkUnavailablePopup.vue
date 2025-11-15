<template>
  <NotificationPopup
    sizeWidth="big"
    rejectButtonText="common.cancel"
    acceptButtonText="accounts.switchNode"
    :headers="headers"
    :showWarningIcon="showWarningIcon"
    :showAcceptButton="haveMoreOneNodes"
    :showRejectButton="true"
    @handlerAccept="openSwitchNode"
    @handlerClose="close"
    :zIndex="500"
  >
    <Checkbox
      :value="isDontShowAgain"
      size="big"
      :label="$t('common.dontShowAgain')"
      class="dont-show-again"
      @change="onChange"
    />
  </NotificationPopup>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { NetworkJson } from '@extension-base/types';
import { Components } from '@/router/routes';
import { useAccountsStore } from '@/stores/accounts';

defineOptions({
  name: 'NetworkUnavailablePopup',
});

const props = defineProps<{
  networks: NetworkJson[];
  network: string;
}>();

const emit = defineEmits<{
  (_event: 'closePopup'): void;
}>();

const accountsStore = useAccountsStore();
const router = useRouter();
const isDontShowAgain = ref(false);

const haveMoreOneNodes = computed(() => {
  const details = props.networks.find(({ name }) => name.toLowerCase() === props.network.toLowerCase());

  return (details?.nodes.length ?? 0) > 1;
});

const headers = computed(() =>
  haveMoreOneNodes.value
    ? { text: 'common.resolveOption' }
    : { text: 'wallet.networkUnavailable', subtext: 'wallet.networkUnavailableSubtext' }
);

const showWarningIcon = computed(() => !haveMoreOneNodes.value);

const openSwitchNode = () => {
  if (isDontShowAgain.value) accountsStore.hideNetworkWarning(props.network);

  router.push({
    name: Components.Nodes,
    params: { network: props.network },
  });
};

const close = () => {
  if (isDontShowAgain.value) accountsStore.hideNetworkWarning(props.network);

  emit('closePopup');
};

const onChange = (value: boolean) => {
  isDontShowAgain.value = value;
};
</script>

<style lang="scss" scoped>
.dont-show-again {
  margin: -10px 0 -20px;
}
</style>
