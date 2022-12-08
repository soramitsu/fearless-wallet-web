<template>
  <div class="wallets-container">
    <Scroll>
      <ul class="wallets__list">
        <Corners v-for="(file, index) in items" size="big" v-bind:key="file.id">
          <li class="wallets__item">
            <div class="json__info" @click.self="onSelect(!file.active, index)">
              <Checkbox
                class="wallet__checkbox"
                size="big"
                :name="file.name"
                :label="file.name"
                v-model.lazy="file.active"
                @change.self="(value) => onSelect(!file.active, index)"
              />
              <span @click.self="onSelect(!file.active, index)">{{ cutAddress(file.address) }}</span>
            </div>
            <transition name="fade">
              <div v-show="file.active" class="json__controls">
                <ValidatedInput
                  v-model="file.password"
                  class="input__validate-pass"
                  typeText="text"
                  :placeholder="$t('addWallet.enterPassword')"
                  :showPassword="true"
                  :readonly="file.isComplete || file.isLoading"
                  :isError="file.isError"
                  :errorDescriptions="$t('addWallet.warningMessages.jsonPassword.text')"
                />

                <Button
                  class="button__confirm"
                  type="primary"
                  size="big"
                  :border="false"
                  :iconName="file.isComplete ? 'check' : file.isLoading ? 'loader' : ''"
                  :iconType="file.isLoading ? 'loading' : ''"
                  :disabled="!file.password.length || file.isLoading || file.isComplete"
                  :text="file.isLoading || file.isComplete ? '' : $t('common.confirm')"
                  @click="onConfirm(index)"
                />
              </div>
            </transition>
          </li>
        </Corners>
      </ul>
    </Scroll>
  </div>
</template>

<script lang="ts">
import { Getter, Action } from 'vuex-class';
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { FilesState, TAction } from '@/interfaces';
import { cut } from '@/helpers/history';
import BaseApi from '@/util/BaseApi';
import { SelectedWallet, SetSelectedWallet } from '@/store/accounts/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { ActionTypes as ActionActionTypes } from '@/store/accounts/actions';
import { isJsonValid } from '@/extension/messaging';

@Component
export default class GoogleWalletsList extends Vue {
  @Prop(Array) items!: FilesState[];
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Action(ActionActionTypes.SET_SELECTED_WALLET) setSelectedWallet!: TAction<SetSelectedWallet>;

  setItemValue(index: number, data: Record<string, string | boolean>) {
    this.items.splice(index, 1, { ...this.items[index], ...data });
  }

  async onConfirm(index: number) {
    this.setItemValue(index, { isLoading: true });

    const { json, ethJson, password } = this.items[index];

    if (!json || !ethJson || !password) return;

    const res = await isJsonValid(json, password);

    if (!res) {
      this.setItemValue(index, { isError: true, isLoading: false });

      return false;
    }

    BaseApi.addKeypairFromJson(ethJson, password);

    const pair = BaseApi.addKeypairFromJson(json, password);

    this.setItemValue(index, { isComplete: true, isLoading: false });
    this.setSelectedWallet({ selectedWalletAddress: pair.address || this.selectedWallet.address });

    return true;
  }

  onSelect(value: boolean, index: number) {
    const file = this.items[index];
    const item = this.items[index];

    if (file.isComplete) return;
    else if (file.isComplete === undefined) {
      this.setItemValue(index, { isLoading: false, isComplete: false });
    }

    if (item.json === undefined) this.$emit('getFile', item.id, index);
    if (item.ethJson === undefined) this.$emit('getFile', item.ethWalletID, index);

    this.setItemValue(index, { active: value });
  }

  cutAddress(address: string) {
    return cut(address);
  }
}
</script>

<style lang="scss" scoped>
.wallets-container {
  display: flex;
  flex-flow: column;
  width: 100%;
  align-items: flex-start;
  overflow-y: hidden;
  min-height: 300px;
  max-height: 450px;
}

.wallets__list {
  padding: 5px;
  width: 100%;
  height: 100%;
  display: flex;
  flex-flow: column nowrap;
  gap: 10px;

  .wallets__item {
    display: flex;
    flex-flow: column nowrap;
    justify-content: space-between;
    align-items: center;
    border: 1px solid $default-background-color;
    background-color: $default-background-color;
    clip-path: $big-clip-path-left-top-and-right-bottom;
    padding: 10px;
    border-radius: 8px;
    z-index: 1;

    .json__info {
      display: flex;
      cursor: pointer;
      align-items: center;
      justify-content: space-between;
      width: 100%;
    }
  }
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
