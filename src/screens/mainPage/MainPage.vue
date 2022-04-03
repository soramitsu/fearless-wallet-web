<template>
  <div class="main-page">
    <div class="nickname">Wallet Name: {{ nickname }}</div>
    <div>addresses:</div>
    <div class="addresses">{{ addresses }}</div>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes } from '../../store/accounts/getters';
import { Accounts } from '../../store/accounts/types';

@Component({})
export default class extends Vue {
  @Getter(GettersTypes.getAccounts) accounts!: Accounts;
  @Getter(GettersTypes.getNickname) nickname!: string;

  get addresses() {
    return this.accounts.map((wallet) => wallet.address);
  }
}
</script>

<style lang="scss" scoped>
.main-page {
  display: flex;
  flex-direction: column;

  .nickname {
    font-size: 15px;
  }

  .addresses {
    font-size: 10px;
  }
}
</style>
