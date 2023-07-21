<template>
  <div class="alerts">
    <AlertItem
      v-for="{ name, descriptions, timespan } in alerts"
      :key="name"
      :name="name"
      :descriptions="descriptions"
      :timespan="timespan"
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
