<template>
  <div>
    <p class="header">
      <span>Request send to</span>
      <img class="icon" :src="icon" />
      {{ name }}
    </p>
    <div class="reset__form" v-if="isResetUIShown">
      <Alert :message="noAnswerMessage" />

      <Corners size="big">
        <div class="corners__container">
          <span>Did you make a mistake?</span>
          <Button size="small" text="Reset Connection" @click="onResetConnection" />
        </div>
      </Corners>

      <Corners size="big">
        <div class="corners__container">
          <span>Wallet not receiving request?</span>
          <Button size="small" text="Cancel Request" @click="onCancelRequest" />
        </div>
      </Corners>
    </div>
    <Loader v-else />
  </div>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import { beaconController } from '@/controllers/beaconController';
import { RequestSentInfo } from '@/interfaces';
import Button from '@/components/Button.vue';
import Loader from '@/components/Loader.vue';
import Corners from '@/components/Corners.vue';
import Alert from '@/components/Alert.vue';
import { Components } from '@/router/routes';

@Component({
  components: {
    Button,
    Loader,
    Corners,
    Alert,
  },
})
export default class PermissionRequest extends Vue {
  @Prop(Object) requestInfo!: RequestSentInfo;
  isResetUIShown = false;
  noAnswerMessage = 'No answer from your wallet received yet. Please make sure the wallet is open';

  mounted() {
    setTimeout(() => {
      this.isResetUIShown = true;
    }, 5000);
  }

  get name() {
    return this.requestInfo.walletInfo.name;
  }

  get icon() {
    return this.requestInfo.walletInfo.icon;
  }

  onResetConnection() {
    beaconController.resetConnection();

    this.$router.push({ name: Components.Wallet });
  }

  onCancelRequest() {
    this.$router.push({ name: Components.Welcome });
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
}

.corners__container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border: 1px solid $default-background-color;
  background-color: $secondary-background-color;
  clip-path: $big-clip-path-left-top;
  width: 100%;
}
</style>
