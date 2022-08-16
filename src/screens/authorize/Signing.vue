<template>
  <div></div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import Logo from '@/components/Logo.vue';
import Button from '@/components/Button.vue';

@Component({
  components: {
    Logo,
    Button,
  },
})
export default class Welcome extends Vue {}
</script>

<style lang="scss" scoped></style>
