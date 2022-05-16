<template>
  <div class="history">
    <HistoryItem
      v-for="{ id, type, value, token, time } in history"
      :key="id"
      :token="token"
      :id="id"
      :time="time"
      :type="type"
      :value="value"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { HistoryItem as HistoryItemType } from '@/interfaces/currencies';
import HistoryItem from './HistoryItem.vue';

@Component({
  components: { HistoryItem },
})
export default class History extends Vue {
  @Prop(Array) history!: HistoryItemType[];
}
</script>

<style lang="scss" scoped>
.history {
}
</style>
