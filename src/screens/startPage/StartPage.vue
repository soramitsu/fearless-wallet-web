<template>
  <div class="start-page">
    <template v-if="!isCreateWallet && !isImportWallet">
      <div class="registration-page">
        <div class="logo">
          <img src="../../assets/fearless-big-logo.svg" height="120px" />
        </div>
        <div class="active-block">
          <div>
            <s-button class="button" type="primary" border-radius="mini" @click="createWallet">
              Create a new wallet
            </s-button>
          </div>
          <div>
            <s-button class="button" type="primary" border-radius="mini" @click="importWallet">
              I already have a wallet
            </s-button>
          </div>
        </div>
      </div>
    </template>

    <template v-else-if="isCreateWallet">
      <Layout @reset="createWallet(false)" />
    </template>

    <template v-else-if="isImportWallet">
      <ImportWallet />
    </template>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import Layout from './Layout.vue';
import ImportWallet from './importWallet/ImportWallet.vue';

@Component({
  components: {
    Layout,
    ImportWallet,
  },
})
export default class App extends Vue {
  isCreateWallet = false;
  isImportWallet = false;

  createWallet(value = true) {
    this.isCreateWallet = value;
  }

  importWallet(value = true) {
    this.isImportWallet = value;
  }
}
</script>

<style lang="scss" scoped>
.start-page {
  min-height: 100%;
  display: flex;
  flex-direction: column;

  .registration-page {
    background-color: rgb(122, 11, 98);
    backdrop-filter: blur(48px);
  }

  .logo {
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: 350px;
  }

  .active-block {
    height: 150px;

    display: flex;
    flex-direction: column;
    justify-content: center;

    .button {
      width: 200px;
      margin-bottom: 10px;
    }
  }
}
</style>
