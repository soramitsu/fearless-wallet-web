<template>
  <div class="import-wallet">
    <FInput
      v-if="!isSubstrate"
      :placeholder="placeholderTypeImportValue"
      :value="typeImportValue"
      :readonly="true"
      size="big"
    />

    <FSelect
      v-else
      :value="typeImport"
      placeholder="common.sourceType"
      size="big"
      class="row"
      :options="optionsImport"
      :disabled="disabledSelect"
      data-testid="sourceTypeSelect"
      @change="changeTypeImport"
    />

    <FInput
      v-if="notJsonImport"
      ref="valueInput"
      type="textarea"
      class="row"
      size="big"
      data-testid="textarea"
      :placeholder="placeholderTypeImportValue"
      :maxlength="200"
      :height="170"
      :value="inputValue"
      @change="changeInputValue"
    />

    <template v-else>
      <div class="row">
        <FInput
          data-testid="textFile"
          type="text-file"
          size="big"
          accept="application/JSON"
          :placeholder="placeholderTypeImportValue"
          :readonly="true"
          :value="inputValue"
          @change="changeInputValue"
        />

        <FInput
          size="big"
          placeholder="common.password"
          class="row"
          data-testid="password"
          :showPassword="true"
          :value="syncedPasswordJson"
          @change="changeSyncedPasswordJson"
        />
      </div>
    </template>

    <AdvancedButton v-if="showSlot" @click="toggleAdvancedFormVisible" />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import type { ImportType } from '@/interfaces';
import AdvancedButton from '@/screens/addWallet/AdvancedButton.vue';

export default defineComponent({ name: 'ImportWallet',
  components: {
    AdvancedButton,
  },
  props: {
    mnemonic: String,
    substrateRawSeed: String,
    ethereumRawSeed: String,
    substrateJson: String,
    ethereumJson: String,
    step: Number,
    isOnlyEthereumAccount: Boolean,
    isSubstrate: Boolean,
    passwordJson: { type: String },
    modelValue: { type: String },
  },
  data() {
    return {
      optionsImport: [
    { label: 'Mnemonic passphrase', value: 'mnemonic' },
    { label: 'Raw seed', value: 'rawSeed' },
    { label: 'Restore JSON', value: 'json' },
  ],
    };
  },
  computed: {
    inputValue: {
      get() {
        return this[this.field];
      },
      set(value: string) {
        this.$emit('setImportValue', value, this.field);
      },
    },
    typeImportValue() {
      return this.optionsImport.find(({ value }) => value === this.typeImport)?.label ?? '';
    },
    field() {
      if (this.typeImport === 'mnemonic') return 'mnemonic';

          if (this.typeImport === 'rawSeed') {
            if (this.isOnlyEthereumAccount) return 'ethereumRawSeed';

            return this.step === 1 ? 'substrateRawSeed' : 'ethereumRawSeed';
          }

          // typeImport === 'json'
          if (this.isOnlyEthereumAccount) return 'ethereumJson';

          return this.step === 1 ? 'substrateJson' : 'ethereumJson';
    },
    disabledSelect() {
      return this.step === 2;
    },
    notJsonImport() {
      return this.typeImport !== 'json';
    },
    showSlot() {
      if (!this.isSubstrate) return false;

          return this.typeImport === 'mnemonic' || (this.typeImport === 'rawSeed' && this.step === 1);
    },
    placeholderTypeImportValue() {
      if (this.typeImport === 'rawSeed') {
            if (this.isOnlyEthereumAccount) {
              return this.t('rawSeed', { type: 'ETH' });
            }

            if (this.step === 1) return this.t('rawSeed', { type: 'Substrate' });

            if (this.step === 2) return this.t('rawSeed', { type: 'ETH' });
          }

          if (this.typeImport === 'json') {
            if (this.step === 1) return this.t('restoreJson', { type: 'Substrate' });

            if (this.step === 2) return this.t('restoreJson', { type: 'Ethereum' });
          }

          return this.t('enterPassphrase');
    },
    syncedPasswordJson: {
      get() {
        return this.passwordJson;
      },
      set(value) {
        this.$emit('update:passwordJson', value);
      },
    },
    typeImport: {
      get() {
        return this.modelValue;
      },
      set(value) {
        this.$emit('update:modelValue', value);
      },
    },
    valueInputComponent() {
      return this.$refs.valueInput;
    },
  },
  watch: {
    "typeImport": 'onTypeImportChanged',
  },
  mounted() {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        this.valueInputComponent.input.focus();
  },
  methods: {
    onTypeImportChanged() {
      this.$emit('reset');
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          //@ts-ignore
          this.$nextTick(() => this.valueInputComponent?.input.focus());
    },
    t(value: string, obj: Record<string, string> = {}) {
      return this.$t(`addWallet.${value}`, obj);
    },
    toggleAdvancedFormVisible() {
      this.$emit('toggleAdvancedFormVisible');
    },
    changeInputValue(value: string) {
      this.inputValue = value;
    },
    changeSyncedPasswordJson(value: string) {
      this.syncedPasswordJson = value;
    },
    changeTypeImport(value: ImportType) {
      this.typeImport = value;
    },
  },
});
</script>

<style lang="scss">
.s-icon-file-file-upload-24::before {
  color: $gray-color;
}

.s-textarea {
  padding: 20px 25px 25px !important;
}

.el-textarea__inner {
  height: 100px !important;
  resize: none !important;
}
</style>

<style lang="scss" scoped>
.import-wallet {
  display: flex;
  flex-direction: column;
  width: 100%;

  .s-icon-file-file-upload-24 {
    color: #ccd2e3 !important;
  }

  .row {
    margin-top: 15px;

    &:first-child {
      margin-top: 0;
    }
  }

  i {
    color: $pink-lavender-color;
  }
}
</style>
