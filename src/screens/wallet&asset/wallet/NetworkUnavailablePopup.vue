<template>
  <NotificationPopup
    sizeWidth="big"
    rejectButtonText="common.cancel"
    acceptButtonText="accounts.switchNode"
    :headers="headers"
    :showWarningIcon="showWarningIcon"
    :showAcceptButton="haveMoreOneNodes"
    :showRejectButton="true"
    @handlerAccept="openSwitchNode"
    @handlerClose="close"
    :zIndex="500"
  >
    <Checkbox
      :value="isDontShowAgain"
      size="big"
      :label="$t('common.dontShowAgain')"
      class="dont-show-again"
      @change="onChange"
    />
  </NotificationPopup>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import { Components } from '@/router/routes';
import { useAccountsStore } from '@/stores/accounts';

export default defineComponent({ name: 'NetworkUnavailablePopup' ,
  props: {
    networks: Array,
    network: String,
  },
  data() {
    return {
      accountsStore: useAccountsStore(),
      isDontShowAgain: false,
    };
  },
  computed: {
    headers() {
      return this.haveMoreOneNodes
            ? { text: 'common.resolveOption' }
            : { text: 'wallet.networkUnavailable', subtext: 'wallet.networkUnavailableSubtext' };
    },
    haveMoreOneNodes() {
      return this.networks.find(({ name }) => name.toLowerCase() === this.network.toLowerCase())!.nodes.length > 1;
    },
    showWarningIcon() {
      return !this.haveMoreOneNodes;
    },
  },
  methods: {
    openSwitchNode() {
      if (this.isDontShowAgain) this.accountsStore.hideNetworkWarning(this.network);

          this.$router.push({
            name: Components.Nodes,
            params: { network: this.network },
          });
    },
    close() {
      if (this.isDontShowAgain) this.accountsStore.hideNetworkWarning(this.network);

          this.$emit('closePopup');
    },
    onChange(value: boolean) {
      this.isDontShowAgain = value;
    },
  },
});
</script>

<style lang="scss" scoped>
.dont-show-again {
  margin: -10px 0 -20px;
}
</style>
