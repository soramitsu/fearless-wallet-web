export interface StoreMutation {
  entries: Record<string, unknown>;
  remove: string[];
}

export type TransformStoredRecords = (current: Record<string, unknown>) => StoreMutation;
