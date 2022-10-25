<template>
  <Popup
    :isIcon="isPendingWithResetForm"
    :height="getHeight"
    :maxHeight="maxHeight"
    :sizeWidth="320"
    :headerType="status"
    :headerText="header"
    :showBorder="true"
    :handlerClose="close"
  >
    <div v-if="isPendingWithResetForm" class="reset__form">
      <span class="message">{{ noAnswerMessage }}</span>
      <Corners size="big">
        <div class="corners__container">
          <span>Did you make a mistake?</span>
          <Button size="small" text="Reset Connection" @click="onResetConnection" />
        </div>
      </Corners>

      <Corners size="big">
        <div class="corners__container">
          <span>Wallet not receiving request?</span>
          <Button size="small" width="180" text="Cancel Request" @click="onCancelRequest" />
        </div>
      </Corners>
    </div>

    <ConnectionStatus v-else-if="isRequestFinished" :status="status" @close="close" />
  </Popup>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import { PermissionResponseOutput } from '@airgap/beacon-sdk';
import ConnectionStatus from '@/screens/mobileConnect/ConnectionStatus.vue';
import { beaconController } from '@/controllers/beaconController';
import { PermissionErrorPayload, RequestSentInfo } from '@/interfaces';
import Button from '@/components/Button.vue';
import Loader from '@/components/Loader.vue';
import Corners from '@/components/Corners.vue';
import Alert from '@/components/Alert.vue';
import Popup from '@/components/Popup.vue';
import { Components } from '@/router/routes';
import { MOBILE_CONNECTOR_MESSAGES } from '@/consts/messages';

@Component({
  components: {
    Button,
    Loader,
    Corners,
    Popup,
    Alert,
    ConnectionStatus,
  },
})
export default class PermissionRequest extends Vue {
  @Prop(Object) requestInfo!: RequestSentInfo | PermissionErrorPayload;
  @Prop({ type: Object || null, default: null }) requestResponse?: PermissionResponseOutput;
  @Prop(String) status!: 'reset_form' | 'success' | 'failed' | 'active_account_exists';

  readonly noAnswerMessage = MOBILE_CONNECTOR_MESSAGES.NO_ANSWER;

  get isSuccess() {
    return this.status === 'success';
  }

  get isFailed() {
    return this.status === 'failed';
  }

  get isActiveAccountExists() {
    return this.status === 'active_account_exists';
  }

  get isRequestFinished() {
    return this.isSuccess || this.isFailed || this.isActiveAccountExists;
  }

  get getHeight() {
    if (this.isRequestFinished) return 300;

    return 400;
  }

  get maxHeight() {
    if (this.isRequestFinished) return 350;

    return 480;
  }

  get isPendingWithResetForm() {
    return this.status === 'reset_form';
  }

  get header() {
    if (this.isRequestFinished) return '';

    return `Request send to Fearless Wallet`;
  }

  close() {
    if (this.isSuccess || this.isActiveAccountExists) this.toWalletScreen();
    else this.$router.back();
  }

  onResetConnection() {
    beaconController.resetConnection();

    this.toWalletScreen();
  }

  toWalletScreen() {
    this.$router.push({ name: Components.Wallet });
  }

  onCancelRequest() {
    this.toWalletScreen();
  }
}
</script>

<style lang="scss" scoped>
.header {
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.message {
  color: $gray-color;
}
.icon {
  width: 40px;
  height: 40px;
  margin-left: 6px;
  margin-right: 6px;
}

.content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.reset__form {
  display: flex;
  flex-flow: column;
  gap: 10px;
  padding: 16px;
}

.corners__container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border: 1px solid $default-background-color;
  background-color: $secondary-background-color;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border-radius: $default-border-radius;
  width: 100%;
}
</style>
