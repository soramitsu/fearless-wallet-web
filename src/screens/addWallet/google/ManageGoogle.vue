<template>
  <FlowStepLayout
    :countSteps="countSteps"
    :step="step"
    :flowSteps="[1, 2]"
    :header="header"
    @back="back"
    :showFullScreenIcon="false"
    @openFullScreen="openFullScreen"
  >
    <div class="authorize-account-list">
      <transition name="fade">
        <SelectWalletItem v-if="!isLoading && isFilesExists" :items="files" />
      </transition>
    </div>

    <template v-slot:control>
      <Button size="big" fontSize="big" width="100%" :text="$t('common.confirm')" @click="proceed" />
    </template>
  </FlowStepLayout>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import Checkbox from '@/components/Checkbox.vue';
import Input from '@/components/Input.vue';
import Scroll from '@/components/Scroll.vue';
import SelectWalletItem from '@/screens/addWallet/google/SelectWalletItem.vue';
import { getGoogleFiles, verifyToken } from '@/extension/messaging';
import { IGDriveFile } from '@/interfaces';
import { Components } from '@/router/routes';
import CircleButton from '@/components/CircleButton.vue';
import FlowStepLayout from '@/screens/addWallet/google/FlowStepLayout.vue';
import Button from '@/components/Button.vue';
import BaseApi from '@/util/BaseApi';

interface FilesState extends IGDriveFile {
  active?: boolean;
  password?: string;
}

@Component({
  components: {
    FlowStepLayout,
    Scroll,
    Input,
    Button,
    CircleButton,
    SelectWalletItem,
    Checkbox,
  },
})
export default class ManageGoogle extends Vue {
  files: FilesState[] = [];
  isLoading = false;
  readonly countSteps = 2;
  step = 1;

  get getToken() {
    return this.$route.params.access_token;
  }

  get isFilesExists() {
    return this.files.length;
  }

  get header() {
    return 'google.selectToImport';
  }

  back() {
    if (this.step === 1) {
      this.$router.push({ name: Components.Welcome });

      return;
    }

    this.step -= 1;
  }

  proceed() {
    if (this.step === this.countSteps) {
      this.$router.push({ name: Components.Wallet });

      return;
    }

    this.step += 1;
  }

  async isTokenValid() {
    const info = await verifyToken(this.getToken);

    return info;
  }

  openFullScreen() {
    BaseApi.windowOpen('/');
  }

  async created() {
    this.isLoading = true;

    const { expires_in } = await verifyToken(this.getToken);

    if (+expires_in <= 0) {
      this.$router.push(Components.Welcome);

      return;
    }

    this.isTokenValid();
    const { files } = await getGoogleFiles(this.getToken);

    this.files = [...files];
    this.files.forEach((el) => {
      el.active = false;
      el.password = '';
    });
    console.log(this.files);
    this.isLoading = false;
  }
}
</script>

<style lang="scss" scoped>
.authorize-account-list {
  height: 100%;
  width: 100%;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s;
}
.fade-enter, .fade-leave-to /* .fade-leave-active below version 2.1.8 */ {
  opacity: 0;
}
</style>
