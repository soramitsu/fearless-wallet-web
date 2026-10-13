<template>
  <div class="wallets-container">
    <span class="wallets__description">{{ $t(descriptionKey) }}</span>

    <Scroll>
      <ul class="wallets__list">
        <li v-for="(file, index) in items" :key="file.id ?? file.address" :aria-busy="file.isLoading">
          <FCorners size="big" class="wallets__item">
            <div class="json__info" @click.self="onSelect(!file.active, index)">
              <Checkbox
                class="wallet__checkbox"
                size="big"
                :label="file.name"
                :value="file.active"
                :disabled="disabled || file.isLoading || file.isComplete"
                @change="onSelect($event, index)"
              />

              <span @click.self="onSelect(!file.active, index)">{{ cutAddress(file.address) }}</span>
            </div>

            <transition name="fade">
              <div v-show="file.active" class="json__controls">
                <ValidatedInput
                  :value="file.password"
                  class="input__validate-pass"
                  typeText="text"
                  placeholder="addWallet.enterPassword"
                  errorDescriptions="common.invalidPassword"
                  :showPassword="true"
                  :readonly="disabled || file.isComplete || file.isLoading"
                  :isError="file.isError"
                  @change="changePassword(index, $event)"
                  @pressEnter="onConfirm(index)"
                />

                <FButton
                  class="button__confirm"
                  aria-live="polite"
                  aria-atomic="true"
                  type="primary"
                  size="big"
                  :border="false"
                  :iconName="file.isComplete ? 'check' : ''"
                  :disabled="isDisabled(file)"
                  :loading="file.isLoading"
                  :focusableWhenDisabled="!disabled"
                  :disabledReason="disabledReason(file)"
                  :text="buttonText(file)"
                  @click="onConfirm(index)"
                />
              </div>
            </transition>

            <div v-if="isGoogle && file.active && !file.isComplete && missingBackup(file)" class="backup-loading">
              <FButton
                text="ux.retry"
                type="secondary"
                :disabled="disabled || file.isFileLoading"
                @click="requestFiles(index)"
              />
            </div>

            <div v-if="isGoogle && file.ethWalletID && file.active && !file.isComplete" class="primary-file-recovery">
              <p>{{ $t('addWallet.google.importFileOnlyHint') }}</p>
              <FButton
                text="addWallet.google.importFileOnly"
                type="secondary"
                :disabled="isDisabled(file, true)"
                data-testid="importGoogleFileOnly"
                @click="importFromGoogle(index, true)"
              />
            </div>
            <p v-if="file.primaryOnly" class="row-status" role="status">{{ $t('addWallet.google.importFileOnlyDone') }}</p>

            <p v-if="file.isComplete && !file.active" class="row-status" role="status" aria-live="polite">
              {{ $t('migration.completed') }}
            </p>

            <!-- What the row offers besides its password (the upgrade's backup download and recovery phrase). -->
            <slot v-if="file.active" name="rowActions" :file="file" :index="index"></slot>
          </FCorners>
        </li>
      </ul>
    </Scroll>
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { FilesState } from '@/interfaces';
import { cut } from '@/helpers';
import { isJsonValid, jsonRestore, updateCurrentAccount, migrateMasterPassword } from '@/extension/messaging';

type RowOperation = { file: FilesState; key: string; token: symbol };
const rowKey = (file: FilesState) => (file.id ? `id:${file.id}` : `address:${file.address}`);

export default defineComponent({
  name: 'BackupWalletsList',
  props: {
    items: { type: Array as PropType<FilesState[]>, default: () => [] },
    isGoogle: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
    descriptionKey: { type: String, default: 'addWallet.google.importExplanation' },
  },
  data() {
    return {
      isActive: true,
      pendingRows: new Map<string, symbol>(),
    };
  },
  beforeUnmount() {
    this.isActive = false;
    this.pendingRows.clear();
  },
  methods: {
    setItemValue(index: number, data: Record<string, string | boolean>) {
      if (this.isActive && this.items[index]) this.$emit('setItemValue', index, data);
    },
    onConfirm(index: number) {
      return this.isGoogle ? this.importFromGoogle(index) : this.migrateAccounts(index);
    },
    beginOperation(index: number, primaryOnly = false): RowOperation | undefined {
      const source = this.items[index];
      if (!this.isActive || !source || this.isDisabled(source, primaryOnly)) return;
      const file = { ...source };
      const key = rowKey(file);
      const token = Symbol(key);
      this.pendingRows.set(key, token);
      this.setItemValue(index, { isLoading: true, isError: false });
      return { file, key, token };
    },
    operationIndex(operation: RowOperation): number {
      if (!this.isActive || this.pendingRows.get(operation.key) !== operation.token) return -1;
      return this.items.findIndex(
        (file) =>
          rowKey(file) === operation.key &&
          file.address === operation.file.address &&
          file.password === operation.file.password
      );
    },
    finishOperation(operation: RowOperation, success: boolean, primaryOnly = false) {
      const index = this.operationIndex(operation);
      if (index >= 0) {
        const complete = success || !!this.items[index].isComplete;
        this.setItemValue(index, { isError: !complete, isComplete: complete, isLoading: false, ...(success && primaryOnly ? { primaryOnly: true } : {}) });
      }
      if (this.pendingRows.get(operation.key) === operation.token) this.pendingRows.delete(operation.key);
    },
    async migrateAccounts(index: number) {
      const operation = this.beginOperation(index);
      if (!operation) return;
      let success = false;
      try {
        success = await migrateMasterPassword({ address: operation.file.address, password: operation.file.password! });
      } catch {
        // Preserve the password and row so an interrupted worker/storage operation can be retried.
      } finally {
        this.finishOperation(operation, success);
      }
    },
    async importFromGoogle(index: number, primaryOnly = false) {
      const operation = this.beginOperation(index, primaryOnly);
      if (!operation) return;
      const { json, ethJson, password } = operation.file;
      let success = false;
      try {
        if (!json || !password) return;
        // Cloud files can independently contain either Substrate or Ethereum keys.
        const { value: valid } = await isJsonValid(json, password, false);
        if (!valid || this.operationIndex(operation) < 0) return;
        let linkedEthereumAddress: string | undefined;
        if (ethJson && !primaryOnly) {
          linkedEthereumAddress = await jsonRestore(ethJson, password);
          if (this.operationIndex(operation) < 0) return;
        }
        const address = await jsonRestore(json, password, linkedEthereumAddress);
        if (this.operationIndex(operation) < 0) return;
        if (!address) throw new Error('Import returned no account');
        await updateCurrentAccount(address);
        success = true;
      } catch {
        // A failed import never appears complete, and always releases the loading state.
      } finally {
        this.finishOperation(operation, success, primaryOnly);
      }
    },
    buttonText(file: FilesState) {
      return file.isComplete ? 'migration.completed' : file.isLoading ? 'migration.pending' : 'common.confirm';
    },
    disabledReason(file: FilesState) {
      if (this.disabled || file.isComplete || file.isLoading) return '';
      if (this.isGoogle && this.missingBackup(file))
        return file.fileLoadError ? 'addWallet.google.somethingWrong' : 'addWallet.google.fetchInfo';
      return !file.password ? 'addWallet.enterPassword' : '';
    },
    isDisabled(file: FilesState, primaryOnly = false) {
      return (
        this.disabled ||
        (this.isGoogle && (primaryOnly ? !file.json : this.missingBackup(file))) ||
        !file.password ||
        file.isLoading ||
        file.isComplete ||
        this.pendingRows.has(rowKey(file))
      );
    },
    missingBackup(file: FilesState) {
      return !file.json || (!!file.ethWalletID && !file.ethJson);
    },
    requestFiles(index: number) {
      const file = this.items[index];
      if (
        !this.isActive ||
        this.disabled ||
        !this.isGoogle ||
        !file ||
        file.isLoading ||
        file.isFileLoading ||
        file.isComplete
      )
        return;
      if (!file.json) this.$emit('getFile', file.id, index);
      if (!file.ethJson && file.ethWalletID) this.$emit('getFile', file.ethWalletID, index);
    },
    changePassword(index: number, password: string) {
      const file = this.items[index];
      if (
        !this.isActive ||
        this.disabled ||
        !file ||
        file.isLoading ||
        file.isComplete ||
        this.pendingRows.has(rowKey(file))
      )
        return;
      this.$emit('setItemPassword', index, password);
    },
    onSelect(value: boolean, index: number) {
      const file = this.items[index];
      if (
        !this.isActive ||
        this.disabled ||
        !file ||
        file.isLoading ||
        file.isComplete ||
        this.pendingRows.has(rowKey(file))
      )
        return;
      if (file.isComplete === undefined) this.setItemValue(index, { isLoading: false, isComplete: false });
      this.setItemValue(index, { active: value });
      if (this.isGoogle && value) this.requestFiles(index);
    },
    cutAddress(address?: string) {
      return address ? cut(address) : '';
    },
  },
});
</script>

<style lang="scss" scoped>
.wallets {
  &-container {
    display: flex;
    flex-flow: column;
    width: 100%;
    align-items: center;
    overflow-y: hidden;
    min-width: 0;
  }

  &__list {
    padding: 5px;
    margin: 0;
    list-style: none;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    display: flex;
    flex-flow: column nowrap;
    gap: 10px;
  }

  &__item {
    display: flex;
    flex-flow: column nowrap;
    justify-content: space-between;
    align-items: center;
    border: $default-border;
    background-color: $default-background-color;
    clip-path: $big-clip-path-left-top-and-right-bottom;
    padding: 10px;
    border-radius: $default-border-radius;
    z-index: 1;

    .json__info {
      display: flex;
      cursor: pointer;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
      overflow-wrap: anywhere;
      width: 100%;
    }
  }

  &__description {
    color: $default-white;
    padding-bottom: 24px;
  }

  .wallet__checkbox {
    flex-shrink: 1;

    .account__checkbox .el-checkbox__label {
      font-size: 1em;
    }

    .checkbox {
      display: flex;
      align-items: center;
      gap: 6px;
    }
  }
}

.json__controls {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;

  .button__confirm {
    flex: 1 1 150px;
    min-width: 0;
    height: auto;
  }

  .input__validate-pass {
    flex: 1 1 180px;
    min-width: 0;
    height: auto;
  }
}
.row-status {
  margin: 8px 0;
  color: var(--fw-text-2);
  overflow-wrap: anywhere;
}
// Concurrent account requests keep a single pending halo in the list.
.wallets__list > li:has(.is-loading) ~ li :deep(.is-loading) {
  box-shadow: none;
}
</style>

<style lang="scss" scoped>
.primary-file-recovery {
  width: 100%;
  margin-top: 16px;
  color: var(--fw-text-2);
  overflow-wrap: anywhere;
}
.primary-file-recovery p { margin: 0 0 12px; }
</style>
