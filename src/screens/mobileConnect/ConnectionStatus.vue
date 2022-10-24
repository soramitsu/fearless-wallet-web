<template>
  <div class="connection__status">
    <img class="connection__status-icon" :src="icon" />
    <span class="connection__status-name" :class="nameColorClass">{{ statusHeader }}</span>
    <span v-if="isSuccess" class="connection__status-message">{{ successMessage }}</span>
    <span v-if="isFailed" class="connection__status-message">{{ failedMessage }}</span>
  </div>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import { PermissionResponseOutput } from '@airgap/beacon-sdk';
import { beaconController } from '@/controllers/beaconController';
import { PermissionErrorPayload, RequestSentInfo } from '@/interfaces';
import Button from '@/components/Button.vue';
import Loader from '@/components/Loader.vue';
import Corners from '@/components/Corners.vue';
import Alert from '@/components/Alert.vue';
import { Components } from '@/router/routes';
import Popup from '@/components/Popup.vue';
@Component({
  components: {
    Button,
    Loader,
    Corners,
    Popup,
    Alert,
  },
})
export default class PermissionRequest extends Vue {
  readonly successMessage = 'Mobile wallet connected to Fearless Wallet Extension';
  readonly failedMessage = 'This Wallet already exists';

  @Prop(String)
  status!: 'success' | 'failed';

  get nameColorClass() {
    return `connection__status-name--${this.isSuccess ? 'success' : 'failed'}`;
  }

  get isSuccess() {
    return this.status === 'success';
  }

  get isFailed() {
    return this.status === 'failed';
  }

  get statusHeader() {
    if (this.isSuccess) return 'Connection is set';

    return 'Connection failed';
  }

  get icon() {
    return require(`@/assets/status__${this.isFailed ? 'failed' : 'success'}.svg`);
  }
}
</script>

<style lang="scss" scoped>
.connection__status {
  display: flex;
  flex-flow: column;
  height: 100%;
  align-items: center;
  justify-content: center;
  padding: 16px;
  gap: 16px;

  .connection__status-message {
    font-size: 18px;
  }

  .connection__status-name {
    font-size: 18px;
    font-weight: 700;
  }

  .connection__status-name--success {
    color: $success-color;
  }

  .connection__status-name--failed {
    color: $reject-color;
  }

  .connection__status-icon {
    width: 60px;
  }
}
</style>
