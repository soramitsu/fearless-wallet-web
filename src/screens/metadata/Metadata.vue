<template>
  <AboveForm :blur="true" header="Metadata" :showCloseIcon="false">
    <Corners size="big">
      <div class="transaction__info">
        <dl class="transaction__list">
          <TransactionInfo name="from" :value="request.url" />
          <TransactionInfo name="chain" :value="request.request.chain" />
          <TransactionInfo name="icon" :value="request.request.specVersion" />
          <TransactionInfo name="decimals" :value="request.request.tokenDecimals" />
          <TransactionInfo name="symbol" :value="request.request.tokenSymbol" />
          <TransactionInfo name="upgrade" :value="request.request.metaCalls" />
        </dl>
      </div>
    </Corners>
    <div class="alert">
      <Alert :message="alertMessage" />
    </div>
    <div class="authorize__control">
      <Button width="100%" text="Yes, allow this application access" size="big" fontSize="big" @click="onApprove" />
      <Button width="100%" type="link" text="Reject" size="big" fontSize="medium" @click="onReject" />
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Vue, Component } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { MetadataRequest } from '@polkadot/extension-base/background/types';
import TransactionInfo from '../signing/TransactionInfo.vue';
import Corners from '@/components/Corners.vue';
import Button from '@/components/Button.vue';
import Hint from '@/components/Hint.vue';
import Alert from '@/components/Alert.vue';
import AboveForm from '@/components/AboveForm.vue';
import store from '@/store';
import { Components } from '@/router/routes';
import { ActionTypes } from '@/store/metadata/actions';

@Component({
  components: {
    Button,
    AboveForm,
    Alert,
    TransactionInfo,
    Corners,
    Hint,
  },
})
export default class MetaRequest extends Vue {
  @Getter('getMetaRequest') requests!: MetadataRequest[];

  alertMessage =
    'This approval will add the metadata to your extension instance, allowing future requests to be decoded using this metadata';

  get request() {
    const [request] = this.requests;

    return request;
  }

  onApprove() {
    store.dispatch(ActionTypes.APPROVE_METADATA_REQUEST, this.request);
    this.$router.push({ name: Components.Wallet });
  }

  onReject() {
    store.dispatch(ActionTypes.REJECT_METADATA_REQUEST, this.request);
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

.transaction__info {
  position: relative;
  background: rgba(255, 255, 255, 0.05);
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border-radius: $default-border-radius;
  width: 100%;
  display: flex;
  flex-flow: column;
  margin-bottom: 14px;
}

.alert {
  margin-bottom: 10px;
}

.transaction__list {
  display: grid;
  grid-template-columns: 100px 1fr;
  place-items: start;
  gap: 8px;
}
</style>
