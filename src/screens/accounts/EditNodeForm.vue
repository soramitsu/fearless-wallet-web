<template>
  <AboveForm header="accounts.newNode" :closeHandler="closeForm">
    <div class="add-node-form">
      <div>
        <Input v-model="networkCharUp" :placeholder="getPath('network')" size="big" class="row" :readonly="true" />

        <Input
          v-model="name"
          :placeholder="getPath('nodeName')"
          typeText="uppercase"
          size="big"
          class="row"
          :maxlength="45"
        />

        <ValidatedInput
          v-model="url"
          :placeholder="getPath('urlAddress')"
          class="row"
          errorDescriptions="accounts.invalidNodeAddress"
          :isError="isErrorUrlNode"
        />
      </div>

      <Button size="big" :text="buttonText" :disabled="buttonDisabled" @click="updateNodes" />
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { firstCharToUp } from '@/helpers/common';
import { NetworkJsonOld } from '@/extension/background/extension-base/src/types';
import { upsertNetworkMap } from '@/extension/messaging';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';

@Component
export default class EditNodeForm extends Vue {
  name = '';
  url = '';

  @Prop(Function) closeForm!: (nodesUpdated?: boolean) => void;
  @Prop(String) network!: string;
  @Prop(String) _name!: string;
  @Prop(String) _url!: string;
  @Prop(Boolean) isActive!: boolean;
  @Getter(NetworksGettersTypes.getAllNetworks) networks!: NetworkJsonOld[];

  get buttonText() {
    return this.isEdit ? 'common.save' : this.getPath('addNode');
  }

  get networkJson() {
    return this.networks.find(({ name }) => name.toLowerCase() === this.network.toLowerCase())!;
  }

  get isEdit() {
    return this._name !== '';
  }

  get isErrorUrlNode() {
    return this.url.length !== 0 && (this.url.length < 7 || !this.url.startsWith('wss://'));
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
    return this.name === '' || this.url === '' || this.isErrorUrlNode || (!this.isUrlChanged && !this.isNameChanged);
  }

  mounted() {
    this.name = this._name;
    this.url = this._url;
  }

  updateNodes() {
    const prepData: Partial<NetworkJsonOld> = {};
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
      isManual: true,
    });

    this.closeForm(true);
  }

  getPath(value: string) {
    return `accounts.${value}`;
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
