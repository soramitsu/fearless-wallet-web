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
              <span @click.self="onSelect(!file.active, index)">{{ cutAddress(file.id) }}</span>
            </div>
            <transition name="fade">
              <div v-show="file.active" class="json__controls">
                <ValidatedInput
                  v-model="file.password"
                  :placeholder="$t('addWallet.enterPassword')"
                  typeText="uppercase"
                  class="input__validate-pass"
                  :errorDescriptions="$t('addWallet.warningMessages.jsonPassword.text')"
                />

                <BorderButton
                  class="button__confirm"
                  type="primary"
                  size="big"
                  :disabled="!file.password.length"
                  :text="$t('common.confirm')"
                  @click="onConfirm"
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
import { Component, Vue, Prop } from 'vue-property-decorator';
import Checkbox from '@/components/Checkbox.vue';
import Corners from '@/components/Corners.vue';
import ValidatedInput from '@/components/ValidatedInput.vue';
import BorderButton from '@/components/BorderButton.vue';
import Scroll from '@/components/Scroll.vue';
import { cut } from '@/helpers/history';
import { IGDriveFile } from '@/interfaces';

interface FilesState extends IGDriveFile {
  active?: boolean;
  password?: string;
}

@Component({
  components: {
    Corners,
    Scroll,
    ValidatedInput,
    BorderButton,
    Checkbox,
  },
})
export default class GoogleWalletsList extends Vue {
  @Prop(Array) items!: FilesState[];

  onConfirm() {
    this.$emit('onConfirm');
  }

  onSelect(value: boolean, index: number) {
    this.items.splice(index, 1, { ...this.items[index], active: value });
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

  .button__confirm,
  .input__validate-pass {
    flex-grow: 1;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter, .fade-leave-to /* .fade-leave-active below version 2.1.8 */ {
  opacity: 0;
}
</style>
