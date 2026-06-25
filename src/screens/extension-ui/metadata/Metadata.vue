<template>
  <AboveForm :fullScreen="true" header="metadata.text" @closeHandler="onReject">
    <div class="meta-content">
      <div>
        <InfoList>
          <InfoItem name="from" :value="request.url" />

          <InfoItem name="chain" :value="request.request.chain" />

          <InfoItem name="specVersion" :value="request.request.specVersion" />

          <InfoItem name="decimals" :value="request.request.tokenDecimals" />

          <InfoItem name="symbol" :value="request.request.tokenSymbol" />

          <InfoItem name="upgrade" :value="request.request.metaCalls" />
        </InfoList>

        <div class="alert">
          <Alert message="metadata.alertMessage" />
        </div>
      </div>

      <FButton width="100%" text="metadata.appAccess" size="big" fontSize="big" @click="onApprove" />
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import { type MetadataRequest } from '@extension-base/background/types/types';
import InfoItem from '@/screens/extension-ui/InfoItem.vue';
import Hint from '@/components/Hint.vue';
import { Components } from '@/router/routes';
import InfoList from '@/screens/extension-ui/InfoList.vue';

import { useExtensionStore } from '@/stores/extension';

export default defineComponent({ name: 'Metadata',
  components: {
    InfoList,
    InfoItem,
    Hint,
  },
  data() {
    return {
      extensionStore: useExtensionStore(),
    };
  },
  computed: {
    request() {
      return this.extensionStore.metaRequests[0];
    },
  },
  watch: {
    "requests": 'updateRoute',
  },
  methods: {
    updateRoute(value: MetadataRequest[]) {
      if (value.length === 0) this.$router.push({ name: Components.Wallet });
    },
    onApprove() {
      this.extensionStore.approveMetaRequests(this.request);
    },
    onReject() {
      this.extensionStore.rejectMetaRequests(this.request);
    },
  },
});
</script>

<style lang="scss" scoped>
.meta-content {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;

  .alert {
    margin: 10px 0;
  }
}
</style>
