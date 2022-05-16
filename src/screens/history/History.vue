<template>
  <div class="history">
    <ComingSoon name="History" />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import ComingSoon from '@/components/ComingSoon.vue';

@Component({ components: { ComingSoon } })
export default class History extends Vue {}
</script>

<style lang="scss" scoped>
.history {
  height: 100%;
}
</style>
