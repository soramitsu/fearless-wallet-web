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
import { Vue, Component, Watch } from 'vue-property-decorator';
import { Action, Getter } from 'vuex-class';
import { MetadataRequest } from '@extension-base/background/types';
import InfoItem from '@/screens/extension-ui/InfoItem.vue';
import Hint from '@/components/Hint.vue';
import { Components } from '@/router/routes';
import { ActionTypes as ExtensionActionTypes } from '@/store/extension/actions';
import InfoList from '@/screens/extension-ui/InfoList.vue';
import { GettersTypes as ExtensionGettersTypes } from '@/store/extension/getters';
import { TAction } from '@/interfaces';

@Component({
  components: {
    InfoList,
    InfoItem,
    Hint,
  },
})
export default class MetaRequest extends Vue {
  @Getter(ExtensionGettersTypes.getMetaRequests) requests!: MetadataRequest[];
  @Action(ExtensionActionTypes.APPROVE_META_REQUEST) onApproveMetaRequest!: TAction<MetadataRequest>;
  @Action(ExtensionActionTypes.REJECT_META_REQUEST) onRejectMetaRequest!: TAction<MetadataRequest>;

  get request() {
    return this.requests[0];
  }

  @Watch('requests')
  updateRoute(value: MetadataRequest[]) {
    if (value.length === 0) this.$router.push({ name: Components.Wallet });
  }

  onApprove() {
    this.onApproveMetaRequest(this.request);
  }

  onReject() {
    this.onRejectMetaRequest(this.request);
  }
}
</script>

<style lang="scss" scoped>
.alert {
  margin-bottom: 10px;
}
</style>
