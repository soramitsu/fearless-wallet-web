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
        <div v-if="loadError" role="alert">
          <FButton text="common.retry" @click="loadAccounts" />
        </div>
        <BackupWalletsList :items="files" @setItemValue="setItemValue" @setItemPassword="setItemPassword" />

        <div class="controls">
          <FButton text="common.continue" width="100%" size="big" :disabled="isDisabledContinue" @click="proceed" />
        </div>
      </div>

    </Scroll>
  </AboveForm>
</template>

<script lang="ts" setup>
import { useRouter } from 'vue-router';
import { ref, computed, onMounted } from 'vue';
import type { FilesState } from '@/interfaces';
import { Components } from '@/router/routes';
import BackupWalletsList from '@/screens/addWallet/BackupWalletsList.vue';
import { getMigrationAccounts } from '@/extension/messaging';

const router = useRouter();
const files = ref<FilesState[]>([]);
const isLoading = ref(true);
const loadError = ref(false);
const isAllAccountComplete = computed(() => files.value.every(({ isComplete }) => isComplete));
const isDisabledContinue = computed(() => isLoading.value || loadError.value || !isAllAccountComplete.value);

const loadAccounts = async () => {
  isLoading.value = true;
  loadError.value = false;
  try {
    const accounts = await getMigrationAccounts();
    files.value = accounts.map(({ address, meta: { name } }) => ({
      name,
      address,
      password: '',
      isComplete: false,
      isLoading: false,
      isError: false,
      active: false,
    }));
  } catch {
    loadError.value = true;
  } finally {
    isLoading.value = false;
  }
};
onMounted(loadAccounts);

const setItemValue = (index: number, data: Record<string, unknown>) => {
  files.value.splice(index, 1, { ...files.value[index], ...data });
};

const setItemPassword = (index: number, password: string) => {
  files.value.splice(index, 1, { ...files.value[index], password });
};

const back = () => router.back();
const proceed = () => router.push({ name: Components.Wallet });
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
