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
import Button from '@/components/Button.vue';
import Hint from '@/components/Hint.vue';
import Alert from '@/components/Alert.vue';
import AboveForm from '@/components/AboveForm.vue';
import { Components } from '@/router/routes';
import { Accounts, WalletInfo } from '@/store/accounts/types';
import { ActionTypes as AuthActionTypes } from '@/store/auth/actions';
import { GettersTypes as AuthGettersTypes } from '@/store/auth/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import SelectAuthAccount from '@/screens/authorize/SelectAuthAccount.vue';
import BaseApi from '@/util/BaseApi';

@Component({
  components: {
    Hint,
    Alert,
    Button,
    AboveForm,
    SelectAuthAccount,
  },
})
export default class Authorize extends Vue {
  readonly noAccountsMessage = 'auth.noAccounts';
  state: Record<string, WalletInfo> = {};
  selectAll = true;

  @Getter(AuthGettersTypes.getAuthRequests) requests!: AuthorizeRequest[];
  @Getter(AccountsGettersTypes.getWallets) wallets!: WalletInfo[];
  @Getter(AccountsGettersTypes.getAccounts) accounts!: Accounts;
  @Action(AuthActionTypes.APPROVE_AUTH_REQUEST) onApproveAuthRequest!: TAction<ApproveAuthRequest>;
  @Action(AuthActionTypes.REJECT_AUTH_REQUEST) onRejectAuthRequest!: TAction<AuthorizeRequest>;

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
    this.onApproveAuthRequest({ request: this.request, accounts: this.prepAccounts });

    this.redirect();
  }

  onReject() {
    this.onRejectAuthRequest(this.request);

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
    height: 180px;
  }
}
</style>
