<template>
  <AboveForm :fullScreen="true" header="accounts.newNode" @closeHandler="$emit('closeForm')">
    <div class="add-node-form">
      <div>
        <FInput v-model="networkCharUp" placeholder="accounts.network" size="big" class="row" :readonly="true" />

        <FInput v-model="name" placeholder="common.name" typeText="uppercase" size="big" class="row" :maxlength="45" />

        <ValidatedInput
          v-model="url"
          placeholder="accounts.urlAddress"
          class="row"
          :errorDescriptions="errorMessage"
          :isError="isError || isUrlDuplicate"
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
import { firstCharToUp } from '@/helpers';
import { upsertNetworkMap } from '@/extension/messaging';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GetNetwork } from '@/store';

@Component
export default class EditNodeForm extends Vue {
  name = '';
  url = '';
  isError = false;
  @Prop(String) network!: string;
  @Prop(String) _name!: string;
  @Prop(String) _url!: string;
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
    return this._name !== '';
  }

  get isUrlDuplicate() {
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

    if (this.urlLength === 0) return;

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

  get networkCharUp() {
    return firstCharToUp(this.network);
  }

  get isUrlChanged() {
    return this.url !== this._url;
  }

  get isNameChanged() {
    return this.name !== this._name;
  }

  get buttonDisabled() {
    return this.name === '' || this.urlLength === 0 || this.isError || (!this.isUrlChanged && !this.isNameChanged);
  }

  mounted() {
    this.name = this._name;
    this.url = this._url;
  }

  updateNodes() {
    if (this.urlLength === 0) return;

    const prepData: Partial<NetworkJson> = {};
    const customNodeIndex = this.networkJson.customNodes.findIndex(
      (el) => el.url === this._url && el.name === this._name
    );

    prepData.customNodes = this.networkJson.customNodes ?? [];

    if (customNodeIndex >= 0) prepData.customNodes[customNodeIndex] = { name: this.name, url: this.url };
    else prepData.customNodes.push({ name: this.name, url: this.url });

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
  }
}
</style>
