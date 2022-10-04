<template>
  <AboveForm :blur="true" header="Metadata" :closeHandler="onReject">
    <InfoList>
      <InfoItem name="from" :value="request.url" />
      <InfoItem name="chain" :value="request.request.chain" />
      <InfoItem name="icon" :value="request.request.specVersion" />
      <InfoItem name="decimals" :value="request.request.tokenDecimals" />
      <InfoItem name="symbol" :value="request.request.tokenSymbol" />
      <InfoItem name="upgrade" :value="request.request.metaCalls" />
    </InfoList>
    <div class="alert">
      <Alert :message="alertMessage" />
    </div>
    <div class="authorize__control">
      <Button width="100%" text="Yes, allow this application access" size="big" fontSize="big" @click="onApprove" />
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Vue, Component } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { MetadataRequest } from '@polkadot/extension-base/background/types';
import InfoItem from '../signing/InfoItem.vue';
import Corners from '@/components/Corners.vue';
import Button from '@/components/Button.vue';
import Hint from '@/components/Hint.vue';
import Alert from '@/components/Alert.vue';
import AboveForm from '@/components/AboveForm.vue';
import store from '@/store';
import { Components } from '@/router/routes';
import { ActionTypes } from '@/store/metadata/actions';
import InfoList from '@/layouts/InfoList.vue';

@Component({
  components: {
    Button,
    AboveForm,
    Alert,
    InfoList,
    InfoItem,
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

.alert {
  margin-bottom: 10px;
}
</style>
