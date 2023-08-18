<template>
  <Fragment>
    <Button text="walletConnect.approve" />
    <Button text="walletConnect.reject" />
  </Fragment>
</template>
<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import {
  approveWalletConnectSession,
  approveWalletConnectNotSupport,
  rejectWalletConnectSession,
  rejectWalletConnectNotSupport,
} from '@/extension/messaging';

@Component({})
export default class WalletConnectRequest extends Vue {
  @Prop(String) id!: string;
  @Prop(Boolean) isSupported!: boolean;

  onApprove() {
    this.isSupported
      ? approveWalletConnectSession({ accounts: [''], id: this.id })
      : approveWalletConnectNotSupport({ id: this.id });
  }

  onReject() {
    this.isSupported ? rejectWalletConnectSession({ id: this.id }) : rejectWalletConnectNotSupport({ id: this.id });
  }
}
</script>
