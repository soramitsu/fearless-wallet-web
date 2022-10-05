<template>
  <div class="auth-accounts">
    <Checkbox label="Select all" />
    <div v-for="(account, index) in accounts" class="account" v-bind:key="index">
      <Checkbox :label="account.name" />
      <Identicon class="identicon" :size="24" theme="polkadot" :value="address" />
      <span>{{ account.address }}</span>
      <img src="@/assets/clipboard.svg" />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import Checkbox from '@/components/Checkbox.vue';
interface AccountsProp {
  name: string;
  address: string;
}
@Component({
  components: { Checkbox },
})
export default class Authorize extends Vue {
  @Prop(Array) accounts!: AccountsProp[];
}
</script>

<style lang="scss" scoped>
.auth-accounts {
  display: flex;
  flex-flow: column;
}
.auth-account {
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  justify-content: space-between;
}
</style>
