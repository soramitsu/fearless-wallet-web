<template>
  <div class="import-wallet">
    <s-select v-model="typeImport" class="row">
      <s-option v-for="option in optionsImport" :key="option.value" :value="option.value" :label="option.label" />
    </s-select>

    <NicknameForm class="row" />

    <div class="row">
      <template v-if="!importJson">
        <s-input :value="mnemonicString" type="textarea" :placeholder="placeholder" @input="onChange" />
      </template>
      <template v-else>
        <s-json-input :value="json ? json : {}" @input="onChange" />
      </template>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import NicknameForm from '../NicknameForm.vue';

@Component({
  components: {
    NicknameForm,
  },
})
export default class App extends Vue {
  typeImport = 'mnemonic';
  optionsImport = [
    { label: 'Mnemonic passphrase', value: 'mnemonic' },
    { label: 'Restore JSON', value: 'JSON' },
  ];

  @Prop(Object) json!: Record<string, string>;
  @Prop(String) password!: string;
  @Prop(Number) currentIndexPage!: number;
  @Prop(Array) mnemonic!: string[];

  get importJson() {
    return this.typeImport === 'JSON';
  }

  get mnemonicString() {
    return this.mnemonic.join(' ');
  }

  get placeholder() {
    if (this.typeImport === 'mnemonic') {
      return 'Mnemonic passphrase';
    }

    return 'JSON';
  }

  @Watch('typeImport')
  onTypeImportChanged(value: string) {
    if (value === 'mnemonic') {
      this.$emit('setJson', {});
    } else {
      this.$emit('setMnemonic', []);
    }
  }

  onChange(value: string) {
    if (this.typeImport === 'mnemonic') {
      this.$emit('setMnemonic', value ? value.split(' ') : []);
    } else {
      this.$emit('setJson', value);
    }
  }

  onChangePassword(value: string) {
    this.$emit('setPassword', value);
  }
}
</script>

<style lang="scss" scoped>
.import-wallet {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  height: 400px;

  .row {
    margin-top: 15px;

    &:first-child {
      margin-top: 0;
    }
  }
}
</style>
