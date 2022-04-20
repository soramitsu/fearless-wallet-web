<template>
  <div class="coming-soon">{{ name }} In developing...</div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class extends Vue {
  @Prop(String) name!: string;
}
</script>

<style lang="scss" scoped>
.coming-soon {
}
</style>
