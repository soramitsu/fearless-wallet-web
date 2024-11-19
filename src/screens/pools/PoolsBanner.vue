<template>
  <div v-if="poolsStore.showPoolsBanner">
    <Icon icon="banner-pools" :hover="false" class="banner-pools" data-testid="bannerPools" />

    <div class="details-button center" data-testid="openPoolsBtn" @click="openPoolsPage">
      <Icon icon="pools-details-button" class="pools-details" />
    </div>

    <!-- <div class="close-button center" @click="hideBanner">
      <Icon icon="close-thin" class="close-icon" />
    </div> -->
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Components } from '@/router/routes';
import { usePoolsStore } from '@/stores/pools';

@Component({})
export default class PoolsBanner extends Vue {
  poolsStore = usePoolsStore();

  openPoolsPage() {
    this.$router.push({ name: Components.Pools });
  }

  hideBanner() {
    this.poolsStore.hidePoolsBanner();
  }
}
</script>

<style scoped lang="scss">
.banner-pools {
  width: calc($extension-width - $default-padding - $default-padding);
  height: 150px;
}

.center {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.details-button {
  top: -56px;
  left: 20px;
  width: 112px;
  min-height: 37px;

  .pools-details {
    height: 37px;

    :hover {
      color: $plain-white;
    }
  }
}

.close-button {
  top: -177px;
  left: 487px;
  width: 32px;
  min-height: 32px;
  border-radius: 50%;

  .close-icon {
    color: $default-white;
    height: 32px;

    :hover {
      color: $plain-white;
    }
  }

  &:hover {
    .close-icon {
      color: $plain-white;
    }
  }
}
</style>
