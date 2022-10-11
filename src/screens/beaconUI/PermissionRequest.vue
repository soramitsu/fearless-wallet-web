<template>
  <div>
    <p class="header">
      <span>Request send to</span>
      <img class="icon" :src="icon" />
      {{ name }}
    </p>

    <Button text="Reset Connection" @click="onResetConnection" />
    <Button text="Cancel Request" @click="onCancelRequest" />
  </div>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import { fearlessConnector } from '@/controllers/beaconController';
import { RequestSentInfo } from '@/interfaces';
import Button from '@/components/Button.vue';

@Component({
  components: {
    Button,
  },
})
export default class PermissionRequest extends Vue {
  @Prop(Object) requestInfo!: RequestSentInfo;

  get name() {
    return this.requestInfo.walletInfo.name;
  }

  get icon() {
    this.requestInfo.extraInfo.resetCallback;

    return this.requestInfo.walletInfo.icon;
  }
  onResetConnection() {
    fearlessConnector.resetConnection();
  }
  onCancelRequest() {
    this.$router.back();
  }
}
</script>

<style lang="scss" scoped>
.header {
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon {
  width: 40px;
  height: 40px;
}
</style>
