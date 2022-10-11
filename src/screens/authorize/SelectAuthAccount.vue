<template>
  <div class="auth-accounts">
    <Checkbox
      size="big"
      label="Select all"
      v-model.lazy="syncSelectAll"
      @change="(value) => $emit('onSelectAll', value)"
    />
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
          <div v-if="account.isMobile" class="account__checkbox--mobile-icon">mobile</div>
        </div>
        <div class="account__address">
          <span>{{ account.address }}</span>
          <img class="clipboard" src="@/assets/clipboard.svg" @click="toClipboard(address)" />
        </div>
      </li>
    </ul>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, PropSync } from 'vue-property-decorator';
import Checkbox from '@/components/Checkbox.vue';
import { WalletInfo } from '@/store/accounts/types';

@Component({
  components: { Checkbox },
})
export default class SelectAuthAccount extends Vue {
  @Prop(Object) accounts!: WalletInfo[];
  @PropSync('selectAll', { type: Boolean }) syncSelectAll!: boolean;

  toClipBoard(address: string) {
    const clipboard = new Clipboard();
    clipboard.writeText(address);
  }
}
</script>

<style lang="scss">
.auth-accounts {
  display: flex;
  flex-flow: column;
  align-items: flex-start;
  overflow-y: hidden;
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
  width: 300px;
  overflow-x: hidden;
  text-overflow: ellipsis;
  padding-right: 30px;
}

.clipboard {
  width: 18px;
  cursor: pointer;
  position: absolute;
  right: 0;
  top: 0;
}

.account__list {
  padding: 0;
  width: 100%;
}

.account__checkbox .el-checkbox__label {
  font-size: 16px;
}
</style>
