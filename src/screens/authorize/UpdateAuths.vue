<template>
  <div class="update-accounts">
    <SelectAuthAccount :selectAll="selectAll" :accounts="state" @onSelectAll="onSelectAll" @onSelect="onSelect" />

    <Button class="connect-button" width="100%" size="big" fontSize="big" :text="buttonText" @click="updateAuths" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
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
    Button,
    AboveForm,
    SelectAuthAccount,
  },
})
export default class Authorize extends Vue {
  selectAll = false;
  state: Record<string, WalletInfo> = {};

  @Prop(String) url!: string;
  @Getter(AccountGettersTypes.getWallets) wallets!: WalletInfo[];
  @Getter(AuthGettersTypes.getAuthList) authlist!: Record<string, AuthUrlInfo>;
  @Action(AuthActionTypes.GET_AUTHLIST) fetchAuthList!: TAction<void>;

  get buttonText() {
    const count = Object.values(this.state).filter((el) => el.active).length;
    const tc = count === 1 ? 1 : 2;

    return {
      text: 'authorize.connectCountAccounts',
      localeProps: { count, tc },
    };
  }

  get prepAccounts() {
    return Object.values(this.state)
      .filter(({ active }) => active)
      .map(({ address }) => address);
  }

  async mounted() {
    const { authorizedAccounts } = this.authlist[this.url];

    this.wallets.forEach(({ name, address, isMobile }) => {
      const isAuthorized = authorizedAccounts.some((el: string) => el === address);

      Vue.set(this.state, name, {
        name: name,
        address: address,
        isMobile: isMobile,
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
    this.selectAll = this.isAllSelected();
  }

  onSelectAll(value: boolean) {
    Object.keys(this.state).forEach((key) => {
      Vue.set(this.state, key, {
        ...this.state[key],
        active: value,
      });
    });

    this.selectAll = value;
  }

  async updateAuths() {
    await updateAuthorization(this.prepAccounts, this.url);
    await this.fetchAuthList();

    this.$emit('updateUrl');
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

.connect-button {
  margin-top: 16px;
}
</style>
