<template>
  <AboveForm header="New Node" :closeHandler="closeForm">
    <div class="add-node-form">
      <div>
        <Input v-model="networkCharUp" placeholder="Network" size="big" :readonly="true" class="row" />

        <Input v-model="name" placeholder="NAME" size="big" class="row" />

        <Input v-model="url" placeholder="URL ADDRESS" size="big" class="row" />
      </div>

      <Button size="big" :text="buttonText" :disabled="buttonDisabled" @click="updateNodes" />
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import { firstCharToUp } from '@/util/helpers';
import AboveForm from '@/components/AboveForm.vue';
import Input from '@/components/Input.vue';
import Button from '@/components/Button.vue';
import AccountController from '@/controllers/accountController';

@Component({
  components: {
    AboveForm,
    Input,
    Button,
  },
})
export default class EditNodeForm extends Vue {
  readonly accountController = new AccountController();
  name = '';
  url = '';

  @Prop(Function) closeForm!: (nodesUpdated?: boolean) => void;
  @Prop(String) network!: string;
  @Prop(String) _name!: string;
  @Prop(String) _url!: string;

  get buttonText() {
    return this.isEdit ? 'Save' : 'Add node';
  }

  get isEdit() {
    return this._name !== '';
  }

  get networkCharUp() {
    return firstCharToUp(this.network);
  }

  get buttonDisabled() {
    return this.name === '' || this.url === '';
  }

  mounted() {
    this.name = this._name;
    this.url = this._url;
  }

  updateNodes() {
    this.accountController.updateCustomNodes({ name: this.name, url: this.url }, this.network, {
      name: this._name,
      url: this._url,
    });

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
