<template>
  <AboveForm :fullScreen="true" header="migration.upgradeKeyStorage" :showCloseIcon="false">
    <div class="migration">
      <div>
        <div class="upgrading-secure">{{ t('migration.actionRequired') }}</div>

        <div class="text">{{ t('migration.upgradingSecure') }}</div>

        <div class="step">
          <div class="circle">1</div>

          <div class="text">{{ t('migration.createMasterPass') }}</div>
        </div>

        <div class="step">
          <div class="circle">2</div>

          <div class="text">{{ t('migration.enterPass') }}</div>
        </div>
      </div>

      <FButton text="common.start" size="big" @click="start" />
    </div>
  </AboveForm>
</template>

<script lang="ts" setup>
import { useRouter } from 'vue-router/composables';
import { useI18n } from 'vue-i18n-composable';
import { ref, onMounted } from 'vue';
import { Components } from '@/router/routes';
import { hasMasterPassword } from '@/extension/messaging';

const router = useRouter();
const { t } = useI18n();

const alreadyHasMasterPassword = ref(false);

onMounted(async () => (alreadyHasMasterPassword.value = await hasMasterPassword()));

const start = () => {
  const name = alreadyHasMasterPassword.value ? Components.MigrationAccounts : Components.ChangePassword;

  router.push({ name });
};
</script>

<style lang="scss" scoped>
.migration {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;

  .upgrading-secure {
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 20px;
    text-align: left;
  }

  .circle {
    width: 40px;
    height: 40px;
    min-width: 40px;
    color: $pink-color;
    background-color: $secondary-background-color;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    font-weight: 700;
    margin-right: 15px;
  }

  .step {
    display: flex;
    justify-content: space-between;
    margin-top: 20px;
  }

  .text {
    color: $default-white;
    text-align: left;
  }
}
</style>
