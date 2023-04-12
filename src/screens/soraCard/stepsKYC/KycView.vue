<template>
  <div class="sora-card sora-card-kyc-wrapper">
    <Loader v-if="loading" />

    <div v-else>
      <div class="sora-card-kyc-view">
        <SScrollbar>
          <div id="kyc"></div>

          <div id="finish" style="display: none">
            <div class="alert alert-success">Kyc was successfull, sample integrator response displayed here</div>
          </div>
        </SScrollbar>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { initWebKyc } from '@/util/soraCard';

@Component
export default class KycView extends Vue {
  loading = true;

  @Prop({ default: '', type: String }) readonly accessToken!: string;

  async mounted(): Promise<void> {
    const confirmKyc = (value: boolean) => this.$emit('confirmKyc', value);

    initWebKyc(confirmKyc);

    setTimeout(() => {
      this.loading = false;
    }, 5000);
  }
}
</script>

<style lang="scss">
.sora-card-kyc-wrapper {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;

  .container {
    padding: 0;
  }
}

.sora-card-kyc-view {
  height: 800px;

  .el-scrollbar {
    height: 800px;
  }

  .container {
    margin: 0;
  }

  .el-scrollbar__wrap {
    border-radius: var(--s-border-radius-medium) !important;
  }
}

#VideoKycFrame {
  iframe {
    background-color: #fff;
  }
}

section.content {
  min-height: 800px;
}
</style>
