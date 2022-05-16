<template>
  <ActivityForm header="Buy Funds" buttonText="Buy" :showButton="false" :closeForm="closeForm" class="buy-form">
    <div>buy</div>
  </ActivityForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import ActivityForm from './ActivityForm.vue';

@Component({
  components: {
    ActivityForm,
  },
})
export default class BuyForm extends Vue {
  @Prop(Function) closeForm!: VoidFunction;
}
</script>

<style lang="scss" scoped>
.buy-form {
}
</style>
