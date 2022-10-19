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
import { Getter, Action } from 'vuex-class';
import { AuthUrlInfo } from '@extension-base/background/types';
import { updateAuthorization } from '@/extension/messaging';
import SelectAuthAccount from '@/screens/authorize/SelectAuthAccount.vue';
import { GettersTypes as AccountGettersTypes } from '@/store/accounts/getters';
import AboveForm from '@/components/AboveForm.vue';
import Button from '@/components/Button.vue';
import { WalletInfo } from '@/store/accounts/types';
import { ActionTypes as AuthActionTypes } from '@/store/auth/actions';
import { TAction } from '@/interfaces';
import { GettersTypes as AuthGettersTypes } from '@/store/auth/getters';

@Component({
  components: {
    SelectAuthAccount,
    AboveForm,
    Button,
  },
})
export default class Authorize extends Vue {
  @Getter(AccountGettersTypes.getWallets) wallets!: WalletInfo[];
  @Action(AuthActionTypes.GET_AUTHLIST) fetchAuthList!: TAction<void>;
  @Getter(AuthGettersTypes.getAuthList) authlist!: Record<string, AuthUrlInfo>;

  selectAll = false;
  state: Record<string, WalletInfo> = {};

  async mounted() {
    const url = this.$route.params.url;
    const { authorizedAccounts } = this.authlist[url];

    this.wallets.forEach((account) => {
      const isAuthorized = authorizedAccounts.some((el: string) => el === account.address);

      Vue.set(this.state, account.name, {
        name: account.name,
        address: account.address,
        isMobile: account.isMobile,
        active: isAuthorized,
      });
    });

    this.selectAll = this.isAllSelected();
  }

  isAllSelected() {
    return Object.values(this.state).every((value) => value.active === true);
  }

  onSelect(value: boolean, name: string) {
    this.state[name].active = value;

    const isAllActive = this.isAllSelected();
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

  async updateAuths() {
    await updateAuthorization(this.prepAccounts, this.$route.params.url);
    await this.fetchAuthList();

    this.$router.back();
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
