<template>
  <div class="export">
    <div class="description">
      <div class="header">Export JSON</div>
      <InformationBlock
        class="information"
        text="Sharing or copying your secret is a high risk operation, don’t send it to anyone. Would you like to proceed with sharing/copying process?"
      />
    </div>

    <div>
      <ValidatedInput
        v-model="password"
        errorDescriptions="Incorrect password"
        placeholder="Password for this account"
        :isError="isError"
        :showPassword="true"
        :maxlength="25"
      />

      <Button
        class="want-export"
        size="big"
        fontSize="big"
        width="100%"
        text="I want to export JSON"
        @click="openExportForm"
      />
    </div>
  </div>
</template>

<script lang="ts">
import Button from '@/components/Button.vue';
import ValidatedInput from '@/components/ValidatedInput.vue';
import InformationBlock from '@/components/InformationBlock.vue';
import { Vue, Component, Watch } from 'vue-property-decorator';
import { accountController } from '@/controllers/accountController';

@Component({
  components: {
    Button,
    ValidatedInput,
    InformationBlock,
  },
})
export default class Export extends Vue {
  password = '';
  isError = false;

  @Watch('password')
  filter() {
    this.isError = false;
  }

  openExportForm() {
    const isSamePassword = accountController.isSamePassword(this.password);

    if (isSamePassword) this.$emit('openExportForm');
    else this.isError = true;
  }
}
</script>

<style lang="scss" scoped>
.export {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  margin-right: 16px;
  margin-bottom: 16px;
  height: calc(100% - 16px);

  .information {
    margin-top: 25px;
  }

  .want-export {
    margin-top: 16px;
  }

  .description {
    display: flex;
    flex-direction: column;
    align-items: flex-start;

    .header {
      font-weight: 800;
      font-size: 22px;
    }
  }
}
</style>
