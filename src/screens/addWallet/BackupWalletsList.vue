<template>
  <div class="wallets-container">
    <span class="wallets__description">{{ $t('addWallet.google.importExplanation') }}</span>

    <Scroll>
      <ul class="wallets__list">
        <FCorners v-for="(file, index) in items" size="big" v-bind:key="file.id">
          <li class="wallets__item">
            <div class="json__info" @click.self="onSelect(!file.active, index)">
              <Checkbox
                class="wallet__checkbox"
                size="big"
                :label="file.name"
                :value="file.active"
                @change.self="() => onSelect(!file.active, index)"
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
                  :readonly="file.isComplete || file.isLoading"
                  :isError="file.isError"
                  @change="changePassword(index, $event)"
                />

                <FButton
                  class="button__confirm"
                  type="primary"
                  size="big"
                  :border="false"
                  :iconName="file.isComplete ? 'check' : file.isLoading ? 'loader' : ''"
                  :iconType="file.isLoading ? 'loading' : ''"
                  :disabled="isDisabled(file)"
                  :text="buttonText(file)"
                  @click="onConfirm(index)"
                />
              </div>
            </transition>
          </li>
        </FCorners>
      </ul>
    </Scroll>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { FilesState } from '@/interfaces';
import { cut } from '@/helpers';

import { isJsonValid, jsonRestore, updateCurrentAccount, migrateMasterPassword } from '@/extension/messaging';
import { useAccountsStore } from '@/stores/accounts';

@Component
export default class BackupWalletsList extends Vue {
  accountsStore = useAccountsStore();

  @Prop(Array) items!: FilesState[];
  @Prop({ default: false }) isGoogle!: boolean;

  setItemValue(index: number, data: Record<string, string | boolean>) {
    this.$emit('setItemValue', index, data);
  }

  onConfirm(index: number) {
    if (this.isGoogle) this.importFromGoogle(index);
    else this.migrateAccounts(index);
  }

  async migrateAccounts(index: number) {
    this.setItemValue(index, { isLoading: true });

    const { address, password } = this.items[index];

    const isSuccess = await migrateMasterPassword({ address: address!, password: password! });

    const fields = {
      isError: !isSuccess,
      isComplete: isSuccess,
      isLoading: false,
    };

    this.setItemValue(index, fields);
  }

  async importFromGoogle(index: number) {
    this.setItemValue(index, { isLoading: true });

    const { json, ethJson, password } = this.items[index];

    if (!json || !password) return;

    const { value: isValid } = await isJsonValid(json, password);

    const fields = {
      isError: !isValid,
      isComplete: isValid,
      isLoading: false,
    };

    this.setItemValue(index, fields);

    if (isValid) {
      if (ethJson) await jsonRestore(ethJson, password);

      const address = await jsonRestore(json, password);

      await updateCurrentAccount(address || this.accountsStore.selectedWallet.address);

      this.setItemValue(index, { isComplete: true, isLoading: false });
    }
  }

  buttonText(file: FilesState) {
    return file.isLoading || file.isComplete ? '' : 'common.confirm';
  }

  isDisabled(file: FilesState) {
    return !file.password || !file.password.length || file.isLoading || file.isComplete;
  }

  changePassword(index: number, password: string) {
    this.$emit('setItemPassword', index, password);
  }

  onSelect(value: boolean, index: number) {
    const file = this.items[index];

    if (file.isComplete) return;
    else if (file.isComplete === undefined) this.setItemValue(index, { isLoading: false, isComplete: false });

    this.setItemValue(index, { active: value });

    if (this.isGoogle) {
      if (file.json === undefined) this.$emit('getFile', file.id, index);

      if (file.ethJson === undefined && file.ethWalletID) this.$emit('getFile', file.ethWalletID, index);
    }
  }

  cutAddress(address?: string) {
    if (!address) return '';

    return cut(address);
  }
}
</script>

<style lang="scss" scoped>
.wallets {
  &-container {
    display: flex;
    flex-flow: column;
    width: 100%;
    align-items: center;
    overflow-y: hidden;
    min-height: 300px;
    max-height: 450px;
  }

  &__list {
    padding: 5px;
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
      font-size: 16px;
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
  gap: 10px;

  .button__confirm {
    width: 182px;
    height: 100%;
  }

  .input__validate-pass {
    flex-grow: 1;
    height: 100%;
  }
}
</style>
