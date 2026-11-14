// The balance card pulses gold when tokens arrive (src/feel/useArrivalFeedback.ts moves it). A module of its own, so a
// screen can follow it without loading the watcher.
import { ref, shallowRef } from 'vue';
import type { Arrival } from '@/feel/arrivals';

/** Counts the arrivals shown in this page. */
export const arrivalPulse = ref(0);
export const lastArrival = shallowRef<Arrival | null>(null);
