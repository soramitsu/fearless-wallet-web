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
          :disabled="saving"
          :maxlength="45"
          @change="changeName"
        />

        <ValidatedInput
          :value="url"
          placeholder="accounts.urlAddress"
          class="row"
          data-testid="urlAddress"
          :disabled="saving"
          :errorDescriptions="errorMessage"
          :isError="isError"
          :maxlength="150"
          @change="changeUrl"
        />
      </div>

      <p v-if="saveError" role="alert">{{ $t('addWallet.google.somethingWrong') }}</p>
      <FButton size="big" data-testid="addNodeBtn" :text="buttonText" :disabled="buttonDisabled" @click="updateNodes" />
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { nodePreferences, sameNodePreferences } from '@extension-base/services/network-service/preferences';
import type { NodePreferences } from '@extension-base/services/network-service/preferences';

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
      saving: false,
      saveError: false,
      viewActive: true,
      openedPreferences: undefined as NodePreferences | undefined,
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
      return this.saving || this.name === '' || this.urlLength === 0 || this.isError || (!this.isUrlChanged && !this.isNameChanged);
    },
  },
  watch: {
    "url": 'isErrorUrlNode',
  },
  mounted() {
    this.name = this.nodeName;
        this.url = this.nodeUrl;
    if (this.networkJson) this.openedPreferences = JSON.parse(JSON.stringify(nodePreferences(this.networkJson)));
  },
  beforeUnmount() { this.viewActive = false; },
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
      if (!this.saving) this.name = value;
    },
    changeUrl(value: string) {
      if (!this.saving) this.url = value;
    },
    async updateNodes() {
      if (this.buttonDisabled || !this.viewActive) return;
      // Inputs and isActive belong to the opened editor. Never silently rebase them onto newer settings.
      if (!this.networkJson || !this.openedPreferences || !sameNodePreferences(this.networkJson, this.openedPreferences)) {
        this.saveError = true;
        return;
      }
      this.saving = true;
      this.saveError = false;
      const network = this.networkJson;
      const customNodes = (network.customNodes ?? []).map((node) => ({ ...node }));
      const index = customNodes.findIndex(({ url, name }) => url === this.nodeUrl && name === this.nodeName);
      const edited = { name: this.name, url: this.url };
      if (index >= 0) customNodes[index] = edited;
      else customNodes.push(edited);
      const selectEdited = !this.isEdit || this.isActive;
      try {
        await upsertNetworkMap({
          ...network, customNodes,
          currentProvider: selectEdited ? this.url : network.currentProvider,
          isManual: selectEdited ? true : network.isManual,
        }, this.openedPreferences);
        if (this.viewActive) this.$emit('closeForm', true);
      } catch {
        if (this.viewActive) this.saveError = true;
      } finally {
        if (this.viewActive) this.saving = false;
      }
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
