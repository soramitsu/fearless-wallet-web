<template>
  <div :class="wrapperClasses">
    <Loader v-if="loading" />

    <div v-show="!loading" class="sora-card-kyc-view">
      <Scroll>
        <div id="kyc"></div>

        <div id="finish" style="display: none">
          <div class="alert alert-success">Kyc was successfull, sample integrator response displayed here</div>
        </div>
      </Scroll>
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

  get wrapperClasses() {
    return [
      'sora-card',
      'sora-card-kyc-wrapper',
      {
        loading: this.loading,
      },
    ];
  }

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
  display: flex;
  flex-direction: column;
  height: 100%;

  .container {
    padding: 0;
  }

  .sora-card-kyc-view {
    height: 900px;

    .container {
      margin: 0;
    }
  }

  #VideoKycFrame {
    iframe {
      background-color: #fff;
      border-radius: 8px !important;
    }
  }

  section.content {
    min-height: 800px;
  }

  .loading {
    justify-content: center;
  }
}
</style>
