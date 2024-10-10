<template>
  <AboveForm
    :fullScreen="true"
    :showBackIcon="true"
    header="migration.upgradeKeyStorage"
    @handlerBack="back"
    :showCloseIcon="false"
  >
    <Scroll>
      <div class="accounts-migration">
        <BackupWalletsList :items="files" @setItemValue="setItemValue" @setItemPassword="setItemPassword" />

        <div class="controls">
          <FButton
            v-if="showSkipBtn"
            size="big"
            width="20%"
            class="skip-btn"
            type="secondary"
            text="common.skip"
            :border="false"
            @click="skipStep"
          />

          <FButton text="common.continue" width="100%" size="big" :disabled="isDisabledContinue" @click="proceed" />
        </div>
      </div>

      <NotificationPopup
        v-if="showSkipPopup"
        acceptButtonText="common.yesSure"
        rejectButtonText="common.cancel"
        sizeWidth="big"
        :showAcceptButton="true"
        :showRejectButton="true"
        :closeByBackground="false"
        :headers="headers"
        @handlerClose="handlerClose"
        @handlerAccept="handlerAccept"
      />
    </Scroll>
  </AboveForm>
</template>

<script lang="ts" setup>
import { useRouter } from 'vue-router/composables';
import { ref, computed, onMounted } from 'vue';
import type { FilesState } from '@/interfaces';
import { Components } from '@/router/routes';
import BackupWalletsList from '@/screens/addWallet/BackupWalletsList.vue';
import { forgetAccount, getMigrationAccounts } from '@/extension/messaging';

const headers = {
  text: 'common.areYouSure',
  subtext: 'migration.skipWarning',
};

const router = useRouter();
const files = ref<FilesState[]>([]);
const showSkipPopup = ref(false);

const isAllAccountComplete = computed(() => files.value.every(({ isComplete }) => isComplete));
const isDisabledContinue = computed(() => !isAllAccountComplete.value);
const notCompleteAccounts = computed(() => files.value.filter(({ isComplete }) => !isComplete));
const showSkipBtn = computed(() => notCompleteAccounts.value.length !== 0);

onMounted(async () => {
  const accounts = await getMigrationAccounts();

  accounts.forEach(({ address, meta: { name } }) => {
    files.value.push({
      name,
      address,
      password: '',
      isComplete: false,
      isLoading: false,
      isError: false,
      active: false,
    });
  });
});

const setItemValue = (index: number, data: Record<string, unknown>) => {
  files.value.splice(index, 1, { ...files.value[index], ...data });
};

const setItemPassword = (index: number, password: string) => {
  files.value.splice(index, 1, { ...files.value[index], password });
};

const back = () => router.back();
const proceed = () => router.push({ name: Components.Wallet });
const skipStep = () => (showSkipPopup.value = true);
const handlerClose = () => (showSkipPopup.value = false);

const handlerAccept = async () => {
  // sequentially delete unnecessary accounts
  for (const { address } of notCompleteAccounts!.value) {
    await forgetAccount(address!, 'native');
  }

  if (notCompleteAccounts.value.length !== files.value.length) proceed();
  else router.push({ name: Components.Wallet });
};
</script>

<style lang="scss" scoped>
.accounts-migration {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
}

.activity-buttons {
  display: flex;
}

.controls {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 10px;
  width: 100%;
}
</style>
