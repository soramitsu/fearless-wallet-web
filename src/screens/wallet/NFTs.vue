<template>
  <div class="nfts">
    <ComingSoon name="NFTs" />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import ComingSoon from '@/components/ComingSoon.vue';

@Component({ components: { ComingSoon } })
export default class extends Vue {}
</script>

<style lang="scss" scoped>
.nfts {
}
</style>
