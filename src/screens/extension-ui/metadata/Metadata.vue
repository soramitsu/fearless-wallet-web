<template>
  <AboveForm :blur="true" header="metadata.text" :closeHandler="onReject">
    <InfoList>
      <InfoItem name="from" :value="request.url" />

      <InfoItem name="chain" :value="request.request.chain" />

      <InfoItem name="icon" :value="request.request.specVersion" />

      <InfoItem name="decimals" :value="request.request.tokenDecimals" />

      <InfoItem name="symbol" :value="request.request.tokenSymbol" />

      <InfoItem name="upgrade" :value="request.request.metaCalls" />
    </InfoList>

    <div class="alert">
      <Alert message="metadata.alertMessage" />
    </div>

    <Button width="100%" text="metadata.appAccess" size="big" fontSize="big" @click="onApprove" />
  </AboveForm>
</template>

<script lang="ts">
import { Vue, Component } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { MetadataRequest } from '@extension-base/background/types';
import InfoItem from '@/screens/extension-ui/InfoItem.vue';
import Corners from '@/components/Corners.vue';
import Button from '@/components/Button.vue';
import Hint from '@/components/Hint.vue';
import Alert from '@/components/Alert.vue';
import AboveForm from '@/components/AboveForm.vue';
import store from '@/store';
import { Components } from '@/router/routes';
import { ActionTypes as ExtensionActionTypes } from '@/store/extension/actions';
import InfoList from '@/screens/extension-ui/InfoList.vue';
import { GettersTypes as ExtensionGettersTypes } from '@/store/extension/getters';

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
  @Getter(ExtensionGettersTypes.getMetaRequests) requests!: MetadataRequest[];

  get request() {
    return this.requests[0];
  }

  onApprove() {
    store.dispatch(ExtensionActionTypes.APPROVE_META_REQUEST, this.request); // TODO: @Action

    this.$router.push({ name: Components.Wallet });
  }

  onReject() {
    store.dispatch(ExtensionActionTypes.REJECT_META_REQUEST, this.request); // TODO: @Action

    this.$router.push({ name: Components.Wallet });
  }
}
</script>

<style lang="scss" scoped>
.alert {
  margin-bottom: 10px;
}
</style>
