<template>
  <div class="coming-soon">{{ name }} in developing...</div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class ComingSoon extends Vue {
  @Prop(String) name!: string;
}
</script>

<style lang="scss" scoped>
.coming-soon {
}
</style>
