<template>
  <div class="auth-accounts">
    <Checkbox size="big" label="Select all" @change="onSelectAll" />
    <ul class="account__list">
      <li v-for="({ name, address }, index) in accounts" class="auth-account" v-bind:key="index">
        <Checkbox
          class="account__checkbox"
          size="big"
          :label="name"
          :id="address"
          v-model="state[name]"
          @change="onSelect"
        />

        <div class="account__address">
          <span>{{ address }}</span>
          <img class="clipboard" src="@/assets/clipboard.svg" @click="toClipboard(address)" />
        </div>
      </li>
    </ul>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import Checkbox from '@/components/Checkbox.vue';
import { getAuthList } from '@/extension/messaging';

interface AccountsProp {
  name: string;
  address: string;
}

@Component({
  components: { Checkbox },
})
export default class Authorize extends Vue {
  @Prop(Array) accounts!: AccountsProp[];
  state = {};

  onSelect() {
    console.log('select');
  }
  async mounted() {
    const { list } = await getAuthList();
  }
  onSelectAll() {
    console.log('selectAll');
  }

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
  border-bottom-color: rgba(255, 255, 255, 0.1);
}
.account__checkbox {
  flex-shrink: 1;
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
