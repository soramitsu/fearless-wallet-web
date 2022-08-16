<template>
  <div>
    <span>{{ text }}</span>
    <Switcher v-model="state" />
    <button @click="onDelete">Delete</button>
  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import Switcher from '@/components/Switcher.vue';
@Component({
  components: {
    Switcher,
  },
})
export default class AuthItem extends Vue {
  @Prop(String) text!: string;
  @Prop(String) state!: boolean;
  @Prop(Function) onDelete!: () => void;
}
</script>

<style lang="scss" scoped></style>
