<template>
  <div class="unstaking-form">1111</div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class RedeemForm extends Vue {
  @Prop({ default: false }) blur!: boolean;
}
</script>

<style lang="scss" scoped></style>
