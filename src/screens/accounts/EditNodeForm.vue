<template>
  <AboveForm header="New Node" :closeHandler="closeForm">
    <div class="add-node-form">
      <div>
        <Input v-model="networkCharUp" placeholder="Network" size="big" class="row" :readonly="true" />

        <Input v-model="name" placeholder="NAME" size="big" class="row" :maxlength="45" />

        <ValidatedInput
          v-model="url"
          placeholder="URL ADDRESS"
          class="row"
          errorDescriptions="Invalid node address format"
          :isError="isErrorUrlNode"
        />
      </div>

      <Button size="big" :text="buttonText" :disabled="buttonDisabled" @click="updateNodes" />
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import AboveForm from '@/components/AboveForm.vue';
import Input from '@/components/Input.vue';
import Button from '@/components/Button.vue';
import { accountController } from '@/controllers/accountController';
import { firstCharToUp } from '@/helpers/common';
import ValidatedInput from '@/components/ValidatedInput.vue';
import NetworksController from '@/controllers/networksController';

@Component({
  components: {
    Input,
    Button,
    AboveForm,
    ValidatedInput,
  },
})
export default class EditNodeForm extends Vue {
  name = '';
  url = '';

  @Prop(Function) closeForm!: (nodesUpdated?: boolean) => void;
  @Prop(String) network!: string;
  @Prop(String) _name!: string;
  @Prop(String) _url!: string;
  @Prop(Boolean) isActive!: boolean;

  get buttonText() {
    return this.isEdit ? 'Save' : 'Add node';
  }

  get isEdit() {
    return this._name !== '';
  }

  get isErrorUrlNode() {
    return this.url !== '' && !this.url.includes('wss://');
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
    accountController.updateCustomNodes({ name: this.name, url: this.url }, this.network, {
      name: this._name,
      url: this._url,
    });

    if (this.isActive) NetworksController.toggleActiveNode(this.network, this.name, this.url, this._url);

    this.closeForm(true);
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
