<template>
  <div class="main-page">
    <div class="nickname">Wallet Name: {{ nickname }}</div>
    <div>Address:</div>
    <div class="address">{{ address }}</div>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes } from '../../store/account/getters';
import { Account } from '../../store/account/types';

@Component({})
export default class extends Vue {
  @Getter(GettersTypes.getAccount) account!: Account;
  @Getter(GettersTypes.getNickname) nickname!: string;

  get address() {
    return this.account?.address ?? '';
  }
}
</script>

<style lang="scss" scoped>
.main-page {
  min-height: 100%;
  display: flex;
  flex-direction: column;

  .nickname {
    font-size: 15px;
  }

  .address {
    font-size: 10px;
  }
}
</style>
