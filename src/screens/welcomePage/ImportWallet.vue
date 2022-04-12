<template>
  <div class="import-wallet">
    <div class="row import" @click="openPopup">
      <s-input :value="typeImportLabel" placeholder="Source type" class="import" size="big" readonly />
    </div>

    <s-input
      v-if="!jsonImport"
      v-model="inputValue"
      :placeholder="placeholder"
      class="row input"
      type="textarea"
      maxlength="130"
    />
    <template v-else>
      <div class="row">
        <s-input
          v-model="inputValue"
          placeholder="Restore JSON"
          size="big"
          type="text-file"
          accept="application/JSON"
          readonly
        />
        <s-input v-model="_passwordJson" placeholder="Password" size="big" show-password class="row" />
      </div>
    </template>

    <slot v-if="!jsonImport"></slot>

    <Popup v-if="showPopup" :handlerClose="closePopup" header="Source type">
      <div
        v-for="{ label, value } in optionsImport"
        :key="label"
        :class="typeImportClasses(value)"
        @click="toggleTypeImport(value)"
      >
        <div>
          {{ label }}
        </div>
        <s-icon name="basic-check-mark-24" v-show="typeImport === value" />
      </div>
    </Popup>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import { TypeFiledForImport, DerivationPath } from '../../interfaces/connectionWallet';
import Popup from '../../components/Popup.vue';

@Component({ components: { Popup } })
export default class extends Vue {
  showPopup = false;
  fileJson = '';
  typeImport: TypeFiledForImport = 'mnemonic';
  optionsImport = [
    { label: 'Mnemonic passphrase', value: 'mnemonic' },
    { label: 'Restore JSON', value: 'json' },
    { label: 'Raw seed', value: 'rawSeed' },
  ];

  @Prop(String) mnemonic!: string;
  @Prop(String) rawSeed!: string;
  @Prop(String) json!: string;
  @Prop(String) passwordJson!: string;
  @Prop(Object) derivationPath!: DerivationPath;

  get typeImportLabel() {
    return this.optionsImport.find(({ value }) => value === this.typeImport)?.label;
  }

  get inputValue() {
    return this[this.typeImport];
  }

  set inputValue(value: string) {
    this.$emit('setValue', value, this.typeImport);
  }

  get _passwordJson() {
    return this.passwordJson;
  }

  set _passwordJson(value: string) {
    this.$emit('setValue', value, 'passwordJson');
  }

  get showEthereumDP() {
    return this.typeImport !== 'rawSeed';
  }

  get mnemonicArray() {
    return this.mnemonic.split(' ');
  }

  get jsonImport() {
    return this.typeImport === 'json';
  }

  get placeholder() {
    if (this.typeImport === 'mnemonic') {
      return 'Enter Passphrase';
    } else if (this.typeImport === 'rawSeed') {
      return 'Raw seed';
    }

    return 'Restore JSON';
  }

  @Watch('typeImport')
  onTypeImportChanged(typeImport: string) {
    this.$emit('setValue', '', 'json');
    this.$emit('setValue', '', 'rawSeed');
    this.$emit('setValue', '', 'mnemonic');
    this.$emit('setValue', '', 'passwordJson');
    this.$emit('setValue', typeImport !== 'rawSeed', 'showEthereumDP');
  }

  typeImportClasses(value: string) {
    return [
      'type-import',
      {
        'active-type-import': this.typeImport === value,
      },
    ];
  }

  toggleTypeImport(value: TypeFiledForImport) {
    this.typeImport = value;

    this.closePopup();
  }

  closePopup() {
    this.showPopup = false;
  }

  openPopup() {
    this.showPopup = true;
  }
}
</script>

<style lang="scss">
.s-icon-file-file-upload-24::before {
  color: rgba(255, 255, 255, 0.5);
}

.s-textarea {
  padding: 20px 25px 25px !important;
}

.el-textarea__inner {
  height: 100px !important;
  resize: none !important;
}

.import {
  cursor: pointer;

  input:hover {
    cursor: pointer;
  }
}
</style>

<style lang="scss" scoped>
.import-wallet {
  display: flex;
  flex-direction: column;

  .s-icon-file-file-upload-24 {
    color: #ccd2e3 !important;
  }

  .input {
    height: 170px;
  }

  .row {
    margin-top: 15px;

    &:first-child {
      margin-top: 0;
    }
  }

  .type-import {
    color: rgba(255, 255, 255, 0.75);
    margin: 8px 0;
    text-align: left;
    width: 100%;
    display: flex;
    justify-content: space-between;

    &:hover {
      cursor: pointer;
      color: #ffffff;
    }
  }

  .active-type-import {
    color: #ffffff;
  }

  i {
    color: #bb77ff;
  }
}
</style>
