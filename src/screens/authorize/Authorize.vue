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
            <SelectAuthAccount :accounts="accs" />
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
  accs: Record<string, string>[] = [];

  @Getter(AuthGettersTypes.getAuthRequests) requests!: AuthorizeRequest[];
  @Getter(AccountsGettersTypes.getWallets) wallets!: Record<string, Accounts>;
  @Getter(AccountsGettersTypes.getAccounts) accounts!: Accounts;

  get isAccountsExists() {
    return BaseApi.getAccounts().length > 0 || BaseApi.getAddresses().length > 0;
  }

  get request() {
    const [request] = this.requests;

    return request;
  }

  mounted() {
    console.log(this.request);

    this.accs.push({
      name: 'test1',
      address: '22342fdsfsdfsdfsdfddffdfdfdfdfdfdfd',
    });
    this.accs.push({
      name: 'test2',
      address: '22342fdsfsdfsdfsdfddffdfdfdfdfdfdfd',
    });
    this.accs.push({
      name: 'test4',
      address: '22342fdsfsdfsdfsdfddffdfdfdfdfdfdfd',
    });
    this.accs.push({
      name: 'test3',
      address: '22342fdsfsdfsdfsdfddffdfdfdfdfdfdfd',
    });
    this.accs.push({
      name: 'test5',
      address: '22342fdsfsdfsdfsdfddffdfdfdfdfdfdfd',
    });
  }

  onApprove() {
    this.$store.dispatch(AuthActionTypes.APPROVE_AUTH_REQUEST, this.request);
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
