<template>
  <div class="history">
    <ComingSoon :name="name" />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { MenuItems } from '@/interfaces/common';

@Component
export default class History extends Vue {
  get name() {
    return MenuItems.history;
  }
}
</script>
