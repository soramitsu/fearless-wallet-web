<template>
  <div class="alerts">
    <AlertItem
      v-for="{ name, timespan, formName } in alerts"
      :key="name"
      :name="name"
      :timespan="timespan"
      :formName="formName"
      @openForm="$emit('openForm', $event)"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import AlertItem from '@/screens/staking/myStake/AlertItem.vue';

type Alert = {
  name: string;
  descriptions: string;
  timespan: number;
};

@Component({
  components: { AlertItem },
})
export default class Alerts extends Vue {
  @Prop({ type: Array }) alerts!: Alert[];
}
</script>
