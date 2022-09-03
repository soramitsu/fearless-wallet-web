<template>
  <AboveForm :blur="true" header="Metadata" :showCloseIcon="false">
    <div class="authorize">
      <div>
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
import { Getter } from 'vuex-class';
import { MetadataRequest } from '@polkadot/extension-base/background/types';
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
    Hint,
  },
})
export default class Authorize extends Vue {
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
</style>
