<template>
  <AboveForm :fullScreen="true" header="accounts.newNode" @closeHandler="$emit('closeForm')">
    <div class="add-node-form">
      <div>
        <FInput v-model="network" placeholder="accounts.network" size="big" class="row" :readonly="true" />

        <FInput v-model="name" placeholder="common.name" typeText="uppercase" size="big" class="row" :maxlength="45" />

        <ValidatedInput
          v-model="url"
          placeholder="accounts.urlAddress"
          class="row"
          :errorDescriptions="errorMessage"
          :isError="isError"
          :maxlength="150"
        />
      </div>

      <FButton size="big" :text="buttonText" :disabled="buttonDisabled" @click="updateNodes" />
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Vue, Component, Prop, Watch } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { NetworkJson } from '@extension-base/types';
import { upsertNetworkMap } from '@/extension/messaging';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { type GetNetwork } from '@/store';

@Component
export default class EditNodeForm extends Vue {
  name = '';
  url = '';
  isError = false;
  @Prop(String) network!: string;
  @Prop(String) nodeName!: string;
  @Prop(String) nodeUrl!: string;
  @Prop(Boolean) isActive!: boolean;
  @Getter(NetworksGettersTypes.allNetworks) networks!: NetworkJson[];
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: GetNetwork;

  get buttonText() {
    return this.isEdit ? 'common.save' : 'accounts.addNode';
  }

  get networkJson() {
    return this.getNetwork(this.network);
  }

  get isEdit() {
    return this.nodeUrl !== '';
  }

  get isUrlDuplicate() {
    if (!this.networkJson) return false;

    return (
      this.networkJson.nodes.some(({ url }) => url === this.url) ||
      this.networkJson.customNodes.some(({ url }) => url === this.url)
    );
  }

  get urlLength() {
    return this.url.length;
  }

  @Watch('url')
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
  }

  get errorMessage() {
    if (this.isError) return 'accounts.invalidNodeAddress';

    return 'accounts.customNodeDuplicate';
  }

  get isUrlChanged() {
    return this.url !== this.nodeUrl;
  }

  get isNameChanged() {
    return this.name !== this.nodeUrl;
  }

  get buttonDisabled() {
    return this.name === '' || this.urlLength === 0 || this.isError || (!this.isUrlChanged && !this.isNameChanged);
  }

  mounted() {
    this.name = this.nodeName;
    this.url = this.nodeUrl;
  }

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
  }
}
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
