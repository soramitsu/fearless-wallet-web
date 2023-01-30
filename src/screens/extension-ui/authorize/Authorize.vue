<template>
  <AboveForm header="Authorize" :fullScreen="true" :closeHandler="onReject">
    <div class="authorize">
      <template v-if="isAccountsExists">
        <div>
          <Alert>
            <p class="authorize__content">
              {{ $t('authorize.selfIdentifyOne') }}
              <span class="authorize__content--name">{{ request.request.origin }}</span>
              {{ $t('authorize.selfIdentifyTwo') }}
              <span class="authorize__content--link">{{ request.url }}</span>
            </p>
          </Alert>

          <div class="authorize-account-list">
            <SelectAuthAccount
              :selectAll="selectAll"
              :accounts="state"
              @onSelectAll="onSelectAll"
              @onSelect="onSelect"
            />
          </div>
        </div>

        <div class="authorize__control">
          <Button width="100%" text="metadata.appAccess" size="big" fontSize="big" @click="onApprove" />
        </div>
      </template>

      <template v-else>
        <Alert :message="noAccountsMessage" />

        <Button width="100%" text="common.understood" size="big" fontSize="big" @click="onReject" />
      </template>
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Vue, Component } from 'vue-property-decorator';
import { Getter, Action } from 'vuex-class';
import { AuthorizeRequest, ApproveAuthRequest } from '@extension-base/background/types';
import { TAction } from '@/interfaces';
import Hint from '@/components/Hint.vue';
import { Components } from '@/router/routes';
import { Accounts, WalletInfo } from '@/store';
import { ActionTypes as ExtensionActionTypes } from '@/store/extension/actions';
import { GettersTypes as ExtensionGettersTypes } from '@/store/extension/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import SelectAuthAccount from '@/screens/extension-ui/authorize/SelectAuthAccount.vue';
import BaseApi from '@/util/BaseApi';
import { cancelAuthRequest } from '@/extension/messaging';

@Component({
  components: {
    Hint,

    SelectAuthAccount,
  },
})
export default class Authorize extends Vue {
  readonly noAccountsMessage = 'auth.noAccounts';
  state: Record<string, WalletInfo> = {};
  selectAll = true;

  @Getter(ExtensionGettersTypes.getAuthRequests) requests!: AuthorizeRequest[];
  @Getter(AccountsGettersTypes.getWallets) wallets!: WalletInfo[];
  @Getter(AccountsGettersTypes.getAccounts) accounts!: Accounts;
  @Action(ExtensionActionTypes.APPROVE_AUTH_REQUEST) onApproveAuthRequest!: TAction<ApproveAuthRequest>;
  @Action(ExtensionActionTypes.REJECT_AUTH_REQUEST) onRejectAuthRequest!: TAction<AuthorizeRequest>;

  get isAccountsExists() {
    return BaseApi.getAccounts().length > 0 || BaseApi.getAddresses().length > 0;
  }

  get request() {
    return this.requests[0];
  }

  mounted() {
    this.wallets.forEach(({ name, address, isMobile }) =>
      Vue.set(this.state, name, {
        name: name,
        address: address,
        isMobile: isMobile,
        active: true,
      })
    );
  }

  onSelect(value: boolean, name: string) {
    this.state[name].active = value;
    this.selectAll = Object.values(this.state).every(({ active }) => active);
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

  get prepAccounts() {
    return Object.values(this.state)
      .filter(({ active }) => active)
      .map(({ address }) => address);
  }

  onApprove() {
    this.onApproveAuthRequest({
      request: this.request,
      accounts: this.prepAccounts,
    });

    this.redirect();
  }

  async onReject() {
    cancelAuthRequest(this.request.id);

    this.redirect();
  }

  redirect() {
    if (BaseApi.useIsPopup()) setTimeout(() => this.$router.push({ name: Components.Wallet }), 100); // don`t removed setTimeout
  }
}
</script>

<style lang="scss" scoped>
.authorize {
  display: flex;
  flex-flow: column;
  justify-content: space-between;
  height: 100%;

  .authorize__content {
    font-size: 14px;
    line-height: 21px;
    font-weight: 400px;
  }

  .authorize__content--name {
    color: #bb77ff;
  }

  .authorize__content--link {
    color: #bb77ff;
    cursor: pointer;
  }

  .authorize__control {
    display: flex;
    flex-flow: column;
    justify-content: space-between;
  }

  .authorize-account-list {
    height: 300px;
  }
}
</style>
