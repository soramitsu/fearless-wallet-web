<template>
  <Popup
    headerText="common.sourceType"
    sizeWidth="big"
    :showBorder="true"
    :showAnimation="false"
    :zIndex="399"
    @handlerClose="handleClose"
  >
    <div class="add-ethereum-account">
      <BorderButton
        borderRadius="mini"
        text="accounts.createNewAccount"
        class="button"
        @click="openAddWalletPage('create')"
      />

      <BorderButton
        borderRadius="mini"
        text="common.alreadyHaveAccount"
        class="button"
        @click="openAddWalletPage('import')"
      />

      <BorderButton borderRadius="mini" text="accounts.dontNeedAccount" class="button" @click="handleClose" />
    </div>
  </Popup>
</template>

<script lang="ts" setup>
import { useRouter } from 'vue-router';
import { Components } from '@/router/routes';

const router = useRouter();
const emit = defineEmits<{
  handlerClose: [];
}>();

const openAddWalletPage = (type: string) => {
  router.push({
    name: Components.AddWallet,
    params: {
      type,
      onlyEthereumAccount: '',
    },
  });
};

const handleClose = () => emit('handlerClose');
</script>

<style lang="scss" scoped>
.add-ethereum-account {
  padding: 0 16px;

  .button {
    margin-top: 10px;
  }
}
</style>
