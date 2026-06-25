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
import { defineComponent } from 'vue';

import AlertItem from '@/screens/staking/myStake/AlertItem.vue';

type Alert = {
  name: string;
  descriptions: string;
  formName: string;
  timespan: number;
};

export default defineComponent({ name: 'Alerts',
  components: { AlertItem },
  props: {
    alerts: { type: Array as () => Alert[] },
  },
});
</script>
