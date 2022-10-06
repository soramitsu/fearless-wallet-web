<template>
  <AboveForm :blur="true" header="Authorize" :closeHandler="onReject">
    <div class="authorize">
      <template v-if="isAccountsExists">
        <div>
          <Alert>
            <p class="authorize__content">
              An application, self-identifying as
              <span class="authorize__content--name">{{ request.request.origin }}</span> is requesting access from my
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
          <Button width="100%" text="Yes, allow this application access" size="big" fontSize="big" @click="onApprove" />
        </div>
      </template>
      <template v-else>
        <Alert :message="noAccountsMessage" />
        <Button width="100%" text="Understood" size="big" fontSize="big" @click="onReject" />
      </template>
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Vue, Component } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { AuthorizeRequest } from '@extension-base/background/types';
import { Accounts } from '@/store/accounts/types';
import Button from '@/components/Button.vue';
import Hint from '@/components/Hint.vue';
import Alert from '@/components/Alert.vue';
import AboveForm from '@/components/AboveForm.vue';
import { Components } from '@/router/routes';
import { ActionTypes as AuthActionTypes } from '@/store/auth/actions';
import { GettersTypes as AuthGettersTypes } from '@/store/auth/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import SelectAuthAccount from '@/screens/authorize/SelectAuthAccount.vue';
import BaseApi from '@/util/BaseApi';
interface AccountsProp {
  name: string;
  address: string;
  isMobile: boolean;
  active: boolean;
}
@Component({
  components: {
    Button,
    SelectAuthAccount,
    AboveForm,
    Alert,
    Hint,
  },
})
export default class Authorize extends Vue {
  noAccountsMessage = "You don't have any account. Please create an account and refresh the application's page.";
  state: Record<string, AccountsProp> = {};
  selectAll = true;
  @Getter(AuthGettersTypes.getAuthRequests) requests!: AuthorizeRequest[];
  @Getter(AccountsGettersTypes.getWallets) wallets!: AccountsProp[];
  @Getter(AccountsGettersTypes.getAccounts) accounts!: Accounts;

  get isAccountsExists() {
    return BaseApi.getAccounts().length > 0 || BaseApi.getAddresses().length > 0;
  }

  get request() {
    const [request] = this.requests;

    return request;
  }

  mounted() {
    this.wallets.forEach((account) => {
      Vue.set(this.state, account.name, {
        name: account.name,
        address: account.address,
        isMobile: account.isMobile,
        active: true,
      });
    });
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

  get prepAccounts() {
    const result: string[] = [];

    Object.values(this.state).map((el) => {
      if (el.active) result.push(el.address);
    });

    return result;
  }

  onApprove() {
    this.$store.dispatch(AuthActionTypes.APPROVE_AUTH_REQUEST, { request: this.request, accounts: this.prepAccounts });
    this.$router.push({ name: Components.Wallet });
  }

  onReject() {
    this.$store.dispatch(AuthActionTypes.REJECT_AUTH_REQUEST, this.request);
    this.$router.push({ name: Components.Wallet });
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
