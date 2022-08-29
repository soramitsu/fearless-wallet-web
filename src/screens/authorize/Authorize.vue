<template>
  <AboveForm :blur="true" header="Authorize" :showCloseIcon="false">
    <div class="authorize">
      <div>
        <p class="authorize__content">
          An application, self-identifying as
          <span class="authorize__content--name">{{ request.origin }}</span> is requesting access from my
          <span class="authorize__content--link">{{ request.url }}</span>
        </p>
        <Alert :message="alertMessage" />
      </div>
      <div class="authorize__control">
        <Button width="100%" text="Yes, allow this application access" size="big" fontSize="big" @click="onApprove" />
        <Button width="100%" type="link" text="Reject" size="big" fontSize="medium" @click="onReject" />
      </div>
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Vue, Component } from 'vue-property-decorator';
import Button from '@/components/Button.vue';
import Hint from '@/components/Hint.vue';
import Alert from '@/components/Alert.vue';
import AboveForm from '@/components/AboveForm.vue';
import store from '@/store';
import { Components } from '@/router/routes';
import { ActionTypes } from '@/store/auth/actions';
import { Getter } from 'vuex-class';
import { AuthorizeRequest } from '@polkadot/extension-base/background/types';

@Component({
  components: {
    Button,
    AboveForm,
    Alert,
    Hint,
  },
})
export default class Authorize extends Vue {
  @Getter('getRequest') requests!: AuthorizeRequest[];
  alertMessage =
    'Only approve this request if you trust the application. Approving gives the application access to the addresses of you accounts';

  get request() {
    const [request] = this.requests;
    return request;
  }

  onApprove() {
    store.dispatch(ActionTypes.APPROVE_REQUEST, this.request);
    this.$router.push({ name: Components.Wallet });
  }

  onReject() {
    store.dispatch(ActionTypes.REJECT_REQUEST, this.request);
    this.$router.push({ name: Components.Wallet });
  }
}
</script>

<style lang="scss" scoped>
.authorize {
  display: flex;
  flex-flow: column;
  justify-content: space-between;
  height: 90%;

  .authorize__content {
    font-size: 16px;
    font-weight: 400px;
    margin-bottom: 20px;
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
    height: 110px;
  }
}
</style>
