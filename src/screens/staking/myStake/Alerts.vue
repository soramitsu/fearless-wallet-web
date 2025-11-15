<template>
  <div class="alerts">
    <AlertItem
      v-for="{ name, timespan, formName } in alerts"
      :key="name"
      :name="name"
      :timespan="timespan"
      :formName="formName"
      @openForm="emit('openForm', $event)"
    />
  </div>
</template>

<script lang="ts" setup>
import AlertItem from '@/screens/staking/myStake/AlertItem.vue';

type Alert = {
  name: string;
  descriptions: string;
  timespan: number;
};

defineProps<{
  alerts: Alert[];
}>();

const emit = defineEmits<{
  openForm: [payload: unknown];
}>();
</script>
