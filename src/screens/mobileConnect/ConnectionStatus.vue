<template>
  <div class="connection__status">
    <Icon :icon="icon" className="connection__status-icon" />

    <span class="connection__status-name" :class="nameColorClass">{{ $t(statusHeader) }}</span>
    <span class="connection__status-message">{{ $t(message) }}</span>
  </div>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import Button from '@/components/Button.vue';
import Loader from '@/components/Loader.vue';
import Corners from '@/components/Corners.vue';
import Alert from '@/components/Alert.vue';
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
  @Prop(String) status!: 'success' | 'failed' | 'active_account_exists';

  get nameColorClass() {
    return `connection__status-name--${this.isSuccess ? 'success' : 'failed'}`;
  }

  get isSuccess() {
    return this.status === 'success';
  }

  get isFailed() {
    return this.status === 'failed';
  }

  get isActiveAccountExists() {
    return this.status === 'active_account_exists';
  }

  get statusHeader() {
    if (this.isSuccess) return this.t('connectionSet');

    return this.t('connectionFailed');
  }

  get message() {
    if (this.isSuccess) return this.t('connected');

    if (this.isFailed) if (this.isActiveAccountExists) return this.t('activeMobileAccountExists');

    return '';
  }

  get icon() {
    return this.isFailed || this.isActiveAccountExists ? 'status__failed' : 'status__success';
  }

  t(value: string) {
    return this.$t(`mobileConnector.${value}`);
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
    height: 60px;
  }
}
</style>
