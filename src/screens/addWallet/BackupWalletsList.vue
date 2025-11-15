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

<script lang="ts" setup>
import type { FilesState } from '@/interfaces';
import { cut } from '@/helpers';
import { isJsonValid, jsonRestore, updateCurrentAccount, migrateMasterPassword } from '@/extension/messaging';
import { useAccountsStore } from '@/stores/accounts';

defineOptions({
  name: 'BackupWalletsList',
});

const accountsStore = useAccountsStore();

const props = withDefaults(
  defineProps<{
    items: FilesState[];
    isGoogle?: boolean;
  }>(),
  {
    isGoogle: false,
  }
);

const emit = defineEmits<{
  setItemValue: [index: number, data: Record<string, string | boolean>];
  setItemPassword: [index: number, password: string];
  getFile: [id: string, index: number];
}>();

const setItemValue = (index: number, data: Record<string, string | boolean>) => {
  emit('setItemValue', index, data);
};

const changePassword = (index: number, password: string) => {
  emit('setItemPassword', index, password);
};

const buttonText = (file: FilesState) => (file.isLoading || file.isComplete ? '' : 'common.confirm');

const isDisabled = (file: FilesState) => !file.password || !file.password.length || file.isLoading || file.isComplete;

const migrateAccounts = async (index: number) => {
  setItemValue(index, { isLoading: true });

  const { address, password } = props.items[index];

  if (!address || !password) {
    setItemValue(index, { isLoading: false, isError: true });

    return;
  }

  const isSuccess = await migrateMasterPassword({ address, password });

  setItemValue(index, {
    isError: !isSuccess,
    isComplete: isSuccess,
    isLoading: false,
  });
};

const importFromGoogle = async (index: number) => {
  setItemValue(index, { isLoading: true });

  const { json, ethJson, password } = props.items[index];

  if (!json || !password) {
    setItemValue(index, { isLoading: false, isError: true });

    return;
  }

  const { value: isValid } = await isJsonValid(json, password);

  setItemValue(index, {
    isError: !isValid,
    isComplete: isValid,
    isLoading: false,
  });

  if (!isValid) return;

  if (ethJson) await jsonRestore(ethJson, password);

  const address = await jsonRestore(json, password);

  await updateCurrentAccount(address || accountsStore.selectedWallet.address);

  setItemValue(index, { isComplete: true, isLoading: false });
};

const onConfirm = (index: number) => {
  if (props.isGoogle) importFromGoogle(index);
  else migrateAccounts(index);
};

const onSelect = (value: boolean, index: number) => {
  const file = props.items[index];

  if (!file) return;

  if (file.isComplete) return;

  if (file.isComplete === undefined) setItemValue(index, { isLoading: false, isComplete: false });

  setItemValue(index, { active: value });

  if (props.isGoogle) {
    if (file.json === undefined) emit('getFile', file.id, index);

    if (file.ethJson === undefined && file.ethWalletID) emit('getFile', file.ethWalletID, index);
  }
};

const cutAddress = (address?: string) => (address ? cut(address) : '');
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
