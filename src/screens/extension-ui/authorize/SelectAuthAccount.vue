<template>
  <div class="auth-accounts">
    <Checkbox
      v-if="showAllCheckbox"
      v-model.lazy="syncSelectAll"
      size="big"
      label="Select all"
      @change="(value) => $emit('onSelectAll', value)"
    />

    <Scroll>
      <ul class="account__list">
        <li v-for="(account, index) in accounts" class="auth-account" v-bind:key="index">
          <div class="checkbox">
            <Checkbox
              class="account__checkbox"
              size="big"
              :name="account.address"
              :label="account.name"
              v-model.lazy="account.active"
              @change="(value) => $emit('onSelect', value, account.name)"
            />

            <div v-if="account.isMobile" class="account__checkbox--mobile-icon">{{ $t('mobile') }}</div>
          </div>
          <div :ref="index" class="account__address">
            <span>{{ cutAddress(account.address) }}</span>

            <Icon className="clipboard" icon="clipboard" @click="saveToClipboard(account.address)" />
            <Tooltip text="Сopied" target=".clipboard" placement="bottom" trigger="click" />
          </div>
        </li>
      </ul>
    </Scroll>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, PropSync } from 'vue-property-decorator';
import { WalletInfo } from '@/store';
import { cut } from '@/helpers/history';

@Component
export default class SelectAuthAccount extends Vue {
  @PropSync('selectAll', { type: Boolean }) syncSelectAll!: boolean;
  @Prop(Object) accounts!: WalletInfo[];

  get showAllCheckbox() {
    return this.accounts.length !== 0;
  }

  cutAddress(address: string) {
    return cut(address);
  }

  saveToClipboard(value: string) {
    navigator.clipboard.writeText(value);
  }
}
</script>

<style lang="scss" scoped>
.auth-accounts {
  display: flex;
  flex-flow: column;
  align-items: flex-start;
  overflow-y: hidden;
  height: 100%;
}

.auth-account {
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  justify-content: space-between;
  align-items: center;
  border: 1px solid transparent;
  border-bottom-color: $default-background-color;
}

.account__checkbox {
  flex-shrink: 1;
}

.checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
}

.account__checkbox--mobile-icon {
  font-size: 12px;
  color: $gray-color;
  background: $secondary-background-color;
  letter-spacing: 0.03em;
  line-height: 15px;
  text-transform: uppercase;
  border-radius: 30px;
  text-align: center;
  padding: 2px 6px;
}

.account__address {
  position: relative;
  width: 230px;
  overflow-x: hidden;
  text-overflow: ellipsis;
  margin-right: 10px;
  height: 24px;
}

.clipboard {
  width: 18px;
  height: 18px;
  cursor: pointer;
  position: absolute;
  right: 0;
  top: 0;

  &:hover {
    opacity: 0.85;
  }
}

.account__list {
  padding: 0;
  width: 100%;
  height: 100%;
}

.account__checkbox .el-checkbox__label {
  font-size: 16px;
}
</style>
