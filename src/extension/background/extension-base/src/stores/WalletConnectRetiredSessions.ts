import { EXTENSION_PREFIX } from '@extension-base/defaults';
import BaseExtensionStore from './BaseExtension';
import BaseWebStore from './BaseWeb';
import { IS_EXTENSION } from '@/consts/global';

export interface RetirementRecord {
  version: 1;
  topics: string[];
  generation?: number;
  approvedTopics?: string[];
  [field: string]: unknown;
}

const validTopic = (topic: unknown): topic is string => typeof topic === 'string' && topic.length > 0 && topic.length <= 512;

function readRecord(value: unknown): RetirementRecord {
  if (value === undefined) return { version: 1, topics: [] };
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid saved session retirement state.');
  const record = value as RetirementRecord;
  if (record.version !== 1 || !Array.isArray(record.topics) || !record.topics.every(validTopic))
    throw new Error('Invalid saved session retirement state.');
  if ((record.generation !== undefined && (!Number.isSafeInteger(record.generation) || record.generation < 0)) ||
    (record.approvedTopics !== undefined && (!Array.isArray(record.approvedTopics) || !record.approvedTopics.every(validTopic))) ||
    ((record.generation ?? 0) > 0 && !Array.isArray(record.approvedTopics)))
    throw new Error('Invalid saved session approval state.');
  return record;
}

export const sessionIsApproved = (record: RetirementRecord, topic: string): boolean =>
  !record.topics.includes(topic) && ((record.generation ?? 0) === 0 || !!record.approvedTopics?.includes(topic));

export default class WalletConnectRetiredSessions extends (IS_EXTENSION ? BaseExtensionStore : BaseWebStore)<RetirementRecord> {
  constructor() {
    super(`${EXTENSION_PREFIX}WalletConnect`);
  }

  async readPolicy(): Promise<RetirementRecord> {
    return readRecord(await super.getAndWait('retiredTopics'));
  }

  async readTopics(): Promise<string[]> {
    return (await this.readPolicy()).topics;
  }

  async reset(topics: string[]): Promise<RetirementRecord> {
    if (!topics.every(validTopic)) throw new Error('Invalid session retirement topic.');
    return (await super.updateAndWait('retiredTopics', current => {
      const record = readRecord(current);
      const generation = (record.generation ?? 0) + 1;
      if (!Number.isSafeInteger(generation)) throw new Error('Invalid session approval generation.');
      // The allowlist fences even sessions the SDK has not exposed yet. It is
      // never inferred from SDK storage, including after a worker restart.
      return { ...record, generation, approvedTopics: [], topics: [...new Set([...record.topics, ...topics])] };
    }, undefined, false))!;
  }

  async approve(topic: string, generation: number, assertCurrent: () => void): Promise<RetirementRecord> {
    if (!validTopic(topic)) throw new Error('Invalid session approval topic.');
    return (await super.updateAndWait('retiredTopics', current => {
      const record = readRecord(current);
      assertCurrent();
      if ((record.generation ?? 0) !== generation || record.topics.includes(topic))
        throw new Error('Wallet changed during session approval');
      return { ...record, approvedTopics: [...new Set([...(record.approvedTopics ?? []), topic])] };
    }, undefined, false))!;
  }

  async retire(topic: string): Promise<void> {
    if (!validTopic(topic)) throw new Error('Invalid session retirement topic.');
    await super.updateAndWait('retiredTopics', (current) => {
      const record = readRecord(current);
      return { ...record, topics: [...new Set([...record.topics, topic])] };
    }, undefined, false);
  }
}
