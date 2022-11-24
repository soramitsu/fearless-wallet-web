<template>
  <div class="google-auth__content">
    <NotificationPopup :handlerClose="close" :headerType="headerType">
      <Loader v-if="isLoading" class="loading" />
      <div v-else>
        <div>{{ message }}</div>
        <div v-if="!isDenied">{{ $t('googleAuth.walletCount', { count: walletCount }) }}</div>

        <Button :text="buttonText" :border="false" />
      </div>
    </NotificationPopup>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import Loader from '@/components/Loader.vue';
import NotificationPopup from '@/components/Popup.vue';
import Button from '@/components/Button.vue';
import { googleAuth } from '@/controllers/googleAuthController';
import { Components } from '@/router/routes';

@Component({
  components: {
    Loader,
    Button,
    NotificationPopup,
  },
})
export default class GoogleAuth extends Vue {
  isDenied = false;
  isLoading = true;
  walletCount: number | null = null;

  @Prop(String) token?: string;

  async mounted() {
    this.isLoading = true;

    if (this.token === 'null') {
      this.isDenied = true;
      this.isLoading = false;

      return;
    }

    const { files } = await googleAuth.getFiles(this.token);

    this.walletCount = files.length;
    this.isLoading = false;
  }

  close() {
    this.$emit('closePopup');
  }

  get isTokenExists() {
    return this.token === null || this.token === undefined;
  }

  get buttonText() {
    if (this.isDenied) return this.$t('common.understood');

    return this.walletCount ? this.$t('googleAuth.import') : this.$t('googleAuth.create');
  }

  get message() {
    return this.isDenied ? this.$t('googleAuth.accessDenied') : this.$t('googleAuth.accessGranted');
  }

  get headerType() {
    return this.isTokenExists ? 'failed' : 'success';
  }

  get headerText() {
    return this.token === null || this.token === undefined ? 'failed' : 'success';
  }

  onContinue() {
    if (this.isDenied) {
      this.close();

      return;
    }

    this.$router.push({
      name: Components.AddWallet,
      params: {
        type: this.walletCount ? 'import' : 'create',
      },
    });
  }
}
</script>

<style lang="scss" scoped>
.google-auth__content {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 10px;
}
</style>
