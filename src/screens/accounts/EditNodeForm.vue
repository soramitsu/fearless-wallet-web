<template>
  <AboveForm :fullScreen="true" header="accounts.newNode" @closeHandler="$emit('closeForm')">
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

<script lang="ts">
import { defineComponent } from 'vue';

import type { NetworkJson } from '@extension-base/types';
import { upsertNetworkMap } from '@/extension/messaging';
import { useNetworksStore } from '@/stores/networks';

export default defineComponent({ name: 'EditNodeForm' ,
  props: {
    network: String,
    nodeName: { type: String, default: '' },
    nodeUrl: { type: String, default: '' },
    isActive: Boolean,
  },
  data() {
    return {
      networksStore: useNetworksStore(),
      name: '',
      url: '',
      isError: false,
    };
  },
  computed: {
    buttonText() {
      return this.isEdit ? 'common.save' : 'accounts.addNode';
    },
    networkJson() {
      return this.networksStore.getNetwork(this.network);
    },
    isEdit() {
      return this.nodeUrl !== '';
    },
    isUrlDuplicate() {
      if (!this.networkJson) return false;

          return (
            this.networkJson.nodes.some(({ url }) => url === this.url) ||
            this.networkJson.customNodes.some(({ url }) => url === this.url)
          );
    },
    urlLength() {
      return this.url.length;
    },
    errorMessage() {
      if (this.isUrlDuplicate) return 'accounts.customNodeDuplicate';

          return 'accounts.invalidNodeAddress';
    },
    isUrlChanged() {
      return this.url !== this.nodeUrl;
    },
    isNameChanged() {
      return this.name !== this.nodeName;
    },
    buttonDisabled() {
      return this.name === '' || this.urlLength === 0 || this.isError || (!this.isUrlChanged && !this.isNameChanged);
    },
  },
  watch: {
    "url": 'isErrorUrlNode',
  },
  mounted() {
    this.name = this.nodeName;
        this.url = this.nodeUrl;
  },
  methods: {
    isErrorUrlNode() {
      this.isError = false;

          if (this.urlLength === 0 || this.url === this.nodeUrl) return;

          if (this.isUrlDuplicate) {
            this.isError = true;

            return;
          }

          const explorers = this.networkJson.externalApi?.explorers;
          const isTooLengthTooSmall = this.urlLength < 7;

          if (explorers && explorers[0].type === 'etherscan') {
            this.isError = isTooLengthTooSmall || !this.url.startsWith('https://');

            return;
          }

          this.isError = isTooLengthTooSmall || !this.url.startsWith('wss://');
    },
    changeName(value: string) {
      this.name = value;
    },
    changeUrl(value: string) {
      this.url = value;
    },
    updateNodes() {
      if (this.urlLength === 0) return;

          const prepData: Partial<NetworkJson> = {};
          const customNodeIndex = this.networkJson.customNodes.findIndex(
            ({ url, name }) => url === this.nodeUrl && name === this.nodeName
          );

          prepData.customNodes = this.networkJson.customNodes ?? [];
          const editedNode = { name: this.name, url: this.url };

          if (customNodeIndex >= 0) prepData.customNodes[customNodeIndex] = editedNode;
          else prepData.customNodes.push(editedNode);

          prepData.currentProvider = this.url;

          upsertNetworkMap({
            ...this.networkJson,
            ...prepData,
            isManual: false,
          });

          this.$emit('closeForm', true);
    },
  },
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
