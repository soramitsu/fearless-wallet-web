<template>
  <AboveForm :blur="true" :closeHandler="back" :header="header">
    <div class="update-accounts">
      <div class="update-accounts__content">
        <SelectAuthAccount :accounts="wallets" />
      </div>
      <Button width="100%" :text="prepName" size="big" fontSize="big" @click="updateAuths" />
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import Accounts from '@extension-base/page/Accounts';
import SelectAuthAccount from '@/screens/authorize/SelectAuthAccount.vue';
import AboveForm from '@/components/AboveForm.vue';
import Button from '@/components/Button.vue';

@Component({
  components: {
    SelectAuthAccount,
    AboveForm,
    Button,
  },
})
export default class Authorize extends Vue {
  @Getter('getWallets') wallets!: Record<string, Accounts>;

  accs: Record<string, string>[] = [];

  back() {
    this.$router.back();
  }

  get header() {
    return `Accounts connected to ${'polkadot.js.org'}`;
  }

  get prepName() {
    return 'Connect 1 accounts(s)';
  }

  updateAuths() {
    console.log('update!');
  }
}
</script>

<style lang="scss" scoped>
.update-accounts {
  display: flex;
  flex-flow: column;
  justify-content: space-between;
  height: 100%;
}

.update-accounts__content {
  height: 300px;
  overflow-y: scroll;
}
</style>
