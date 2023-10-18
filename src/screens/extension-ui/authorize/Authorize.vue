<template>
  <AboveForm header="Authorize" :fullScreen="true" @closeHandler="onReject">
    <div class="authorize">
      <template v-if="isAccountsExists">
        <div>
          <Alert>
            <p class="authorize__content" v-html="message"></p>
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
          <FButton width="100%" text="metadata.appAccess" size="big" fontSize="big" @click="onApprove" />
        </div>
      </template>

      <template v-else>
        <Alert :message="noAccountsMessage" />

        <FButton width="100%" text="common.understood" size="big" fontSize="big" @click="onReject" />
      </template>
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Vue, Component, Watch } from 'vue-property-decorator';
import { Getter, Action } from 'vuex-class';
import { AuthorizeRequest, ApproveAuthRequest, AccountJson } from '@extension-base/background/types/types';
import { AsyncFn } from '@/interfaces';
import Hint from '@/components/Hint.vue';
import { Components } from '@/router/routes';
import { WalletInfo } from '@/store';
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

  @Getter(ExtensionGettersTypes.authRequests) requests!: AuthorizeRequest[];
  @Getter(AccountsGettersTypes.getAccounts) accounts!: AccountJson[];
  @Action(ExtensionActionTypes.APPROVE_AUTH_REQUEST) onApproveAuthRequest!: AsyncFn<ApproveAuthRequest>;
  @Action(ExtensionActionTypes.REJECT_AUTH_REQUEST) onRejectAuthRequest!: AsyncFn<AuthorizeRequest>;

  get isAccountsExists() {
    return this.accounts.length > 0;
  }

  get request(): AuthorizeRequest {
    return this.requests[0];
  }

  @Watch('requests')
  updateRoute(value: AuthorizeRequest[]) {
    if (value.length === 0) this.$router.push({ name: Components.Wallet });
  }
  get message() {
    return this.$t('authorize.authWarningMessage', {
      name: `<span class="authorize__content--name">${this.request.request.origin}</span>`,
      link: `<span class="authorize__content--link">${this.request.url}</span>`,
    });
  }
  mounted() {
    this.accounts.forEach(({ name, address, isMobile }) =>
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
  }

  redirect() {
    if (BaseApi.useIsPopup()) setTimeout(() => this.$router.push({ name: Components.Wallet }), 100); // don`t removed setTimeout
  }
}
</script>

<style lang="scss">
.authorize {
  display: flex;
  flex-flow: column;
  justify-content: space-between;
  height: 100%;

  .authorize__content {
    font-size: 14px;
    line-height: 21px;
    font-weight: 400;

    .authorize__content--name {
      color: $pink-lavender-color;
    }

    .authorize__content--link {
      color: $pink-lavender-color;
      cursor: pointer;
    }
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
