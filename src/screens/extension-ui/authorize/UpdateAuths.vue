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
import type { AsyncFn } from '@/interfaces';
import { updateAuthorization } from '@/extension/messaging';
import SelectAuthAccount from '@/screens/extension-ui/authorize/SelectAuthAccount.vue';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { WalletInfo } from '@/store';
import { ActionTypes as ExtensionActionTypes } from '@/store/extension/actions';
import { GettersTypes as ExtensionGettersTypes } from '@/store/extension/getters';

@Component({
  components: {
    SelectAuthAccount,
  },
})
export default class UpdateAuths extends Vue {
  selectAll = false;
  state: Record<string, WalletInfo> = {};

  @Prop(String) url!: string;
  @Getter(AccountsGettersTypes.getWallets) wallets!: WalletInfo[];
  @Getter(ExtensionGettersTypes.authList) authlist!: Record<string, AuthUrlInfo>;
  @Action(ExtensionActionTypes.GET_AUTHLIST) getAuthList!: AsyncFn<void>;

  get buttonText() {
    const count = Object.values(this.state).filter((el) => el.active).length;
    const tc = count === 1 ? 1 : 2;

    return {
      text: 'authorize.connectCountAccounts',
      localeProps: { count, tc },
    };
  }

  async mounted() {
    const { authorizedAccounts } = this.authlist[this.url];

    this.wallets.forEach(({ name, address, isMobile }) =>
      Vue.set(this.state, name, {
        name: name,
        address: address,
        isMobile: isMobile,
        active: authorizedAccounts.includes(address),
      })
    );

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
    const activeAccounts = Object.values(this.state)
      .filter(({ active }) => active)
      .map(({ address }) => address);

    await updateAuthorization(activeAccounts, this.url);
    await this.getAuthList();

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
