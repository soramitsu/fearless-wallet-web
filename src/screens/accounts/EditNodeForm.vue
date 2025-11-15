<template>
  <AboveForm :fullScreen="true" header="accounts.newNode" @closeHandler="handleClose">
    <div class="add-node-form">
      <div>
        <FInput
          :value="network"
          placeholder="accounts.network"
          size="big"
          class="row"
          data-testid="network"
          :readonly="true"
        />

        <FInput
          :value="name"
          placeholder="common.name"
          typeText="uppercase"
          size="big"
          class="row"
          data-testid="name"
          :maxlength="45"
          @change="changeName"
        />

        <ValidatedInput
          :value="url"
          placeholder="accounts.urlAddress"
          class="row"
          data-testid="urlAddress"
          :errorDescriptions="errorMessage"
          :isError="isError"
          :maxlength="150"
          @change="changeUrl"
        />
      </div>

      <FButton size="big" data-testid="addNodeBtn" :text="buttonText" :disabled="buttonDisabled" @click="updateNodes" />
    </div>
  </AboveForm>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import type { NetworkJson } from '@extension-base/types';
import { upsertNetworkMap } from '@/extension/messaging';
import { useNetworksStore } from '@/stores/networks';

const networksStore = useNetworksStore();

const props = withDefaults(
  defineProps<{
    network: string;
    nodeName?: string;
    nodeUrl?: string;
    isActive: boolean;
  }>(),
  {
    nodeName: '',
    nodeUrl: '',
  }
);

const emit = defineEmits<{
  closeForm: [updated?: boolean];
}>();

const name = ref('');
const url = ref('');
const isError = ref(false);

const networkJson = computed(() => networksStore.getNetwork(props.network));
const isEdit = computed(() => props.nodeUrl !== '');
const urlLength = computed(() => url.value.length);

const isUrlDuplicate = computed(() => {
  if (!networkJson.value) return false;

  return (
    networkJson.value.nodes.some(({ url: nodeUrl }) => nodeUrl === url.value) ||
    networkJson.value.customNodes.some(({ url: nodeUrl }) => nodeUrl === url.value)
  );
});

const errorMessage = computed(() =>
  isUrlDuplicate.value ? 'accounts.customNodeDuplicate' : 'accounts.invalidNodeAddress'
);

const isUrlChanged = computed(() => url.value !== props.nodeUrl);
const isNameChanged = computed(() => name.value !== props.nodeName);

const buttonDisabled = computed(
  () => name.value === '' || urlLength.value === 0 || isError.value || (!isUrlChanged.value && !isNameChanged.value)
);

const buttonText = computed(() => (isEdit.value ? 'common.save' : 'accounts.addNode'));

const validateUrl = () => {
  isError.value = false;

  if (urlLength.value === 0 || url.value === props.nodeUrl) return;

  if (isUrlDuplicate.value) {
    isError.value = true;

    return;
  }

  const explorers = networkJson.value?.externalApi?.explorers;
  const isTooShort = urlLength.value < 7;

  if (explorers && explorers[0].type === 'etherscan') {
    isError.value = isTooShort || !url.value.startsWith('https://');

    return;
  }

  isError.value = isTooShort || !url.value.startsWith('wss://');
};

watch(url, validateUrl);

const changeName = (value: string) => {
  name.value = value;
};

const changeUrl = (value: string) => {
  url.value = value;
};

const updateNodes = () => {
  if (urlLength.value === 0 || !networkJson.value) return;

  const prepData: Partial<NetworkJson> = {};
  const customNodeIndex = networkJson.value.customNodes.findIndex(
    ({ url: existingUrl, name: existingName }) => existingUrl === props.nodeUrl && existingName === props.nodeName
  );

  prepData.customNodes = [...(networkJson.value.customNodes ?? [])];
  const editedNode = { name: name.value, url: url.value };

  if (customNodeIndex >= 0) prepData.customNodes[customNodeIndex] = editedNode;
  else prepData.customNodes.push(editedNode);

  prepData.currentProvider = url.value;

  upsertNetworkMap({
    ...networkJson.value,
    ...prepData,
    isManual: false,
  });

  handleClose(true);
};

const handleClose = (updated = false) => emit('closeForm', updated);

onMounted(() => {
  name.value = props.nodeName ?? '';
  url.value = props.nodeUrl ?? '';
});
</script>

<style lang="scss" scoped>
.add-node-form {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;

  .row {
    margin-top: 16px;
    & .el-input__inner::first-letter {
      text-transform: capitalize;
    }
  }
}
</style>
