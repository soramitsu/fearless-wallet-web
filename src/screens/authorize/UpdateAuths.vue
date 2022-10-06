<template>
  <AboveForm :blur="true" :closeHandler="back" :header="header">
    <div class="update-accounts">
      <div class="update-accounts__content">
        <SelectAuthAccount :selectAll="selectAll" :accounts="state" @onSelectAll="onSelectAll" @onSelect="onSelect" />
      </div>
      <Button width="100%" :text="prepName" size="big" fontSize="big" @click="updateAuths" />
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { getAuthList, updateAuthorization } from '@/extension/messaging';
import SelectAuthAccount from '@/screens/authorize/SelectAuthAccount.vue';
import AboveForm from '@/components/AboveForm.vue';
import Button from '@/components/Button.vue';
interface AccountsProp {
  name: string;
  address: string;
  isMobile: boolean;
  active: boolean;
}
@Component({
  components: {
    SelectAuthAccount,
    AboveForm,
    Button,
  },
})
export default class Authorize extends Vue {
  @Getter('getWallets') wallets!: AccountsProp[];

  selectAll = false;
  state: Record<string, AccountsProp> = {};

  async mounted() {
    const url = this.$route.params.url;
    const { list } = await getAuthList();
    const { authorizedAccounts } = list[url];

    this.wallets.forEach((account) => {
      const isAuthorized = authorizedAccounts.some((el: string) => el === account.address);

      Vue.set(this.state, account.name, {
        name: account.name,
        address: account.address,
        isMobile: account.isMobile,
        active: isAuthorized,
      });
    });

    this.selectAll = Object.values(this.state).every((value) => value.active === true);
  }

  onSelect(value: boolean, name: string) {
    this.state[name].active = value;

    const isAllActive = Object.values(this.state).every((el) => el.active === true);
    this.selectAll = isAllActive;

    return this.state[name].active;
  }

  onSelectAll(value: boolean) {
    Object.keys(this.state).forEach((key) => {
      Vue.set(this.state, key, {
        ...this.state[key],
        active: value,
      });
    });
    this.selectAll = value;

    return this.selectAll;
  }

  back() {
    this.$router.back();
  }

  get header() {
    return `Accounts connected to ${this.$route.params.url}`;
  }

  get prepName() {
    const count = Object.values(this.state).filter((el) => el.active).length;

    if (count === 1) return 'Connect 1 account';

    return `Connect ${count} accounts`;
  }
  get prepAccounts() {
    const result: string[] = [];

    Object.values(this.state).map((el) => {
      if (el.active) result.push(el.address);
    });

    return result;
  }

  updateAuths() {
    updateAuthorization(this.prepAccounts, this.$route.params.url).then(() => {
      this.$router.back();
    });
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
