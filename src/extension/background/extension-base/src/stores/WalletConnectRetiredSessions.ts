import { EXTENSION_PREFIX } from '@extension-base/defaults';
import BaseExtensionStore from './BaseExtension';
import BaseWebStore from './BaseWeb';
import { IS_EXTENSION } from '@/consts/global';

interface RetirementRecord {
  version: 1;
  topics: string[];
  [field: string]: unknown;
}

const validTopic = (topic: unknown): topic is string => typeof topic === 'string' && topic.length > 0 && topic.length <= 512;

function readRecord(value: unknown): RetirementRecord {
  if (value === undefined) return { version: 1, topics: [] };
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid saved session retirement state.');
  const record = value as RetirementRecord;
  if (record.version !== 1 || !Array.isArray(record.topics) || !record.topics.every(validTopic))
    throw new Error('Invalid saved session retirement state.');
  return record;
}

export default class WalletConnectRetiredSessions extends (IS_EXTENSION ? BaseExtensionStore : BaseWebStore)<RetirementRecord> {
  constructor() {
    super(`${EXTENSION_PREFIX}WalletConnect`);
  }

  async readTopics(): Promise<string[]> {
    return readRecord(await super.getAndWait('retiredTopics')).topics;
  }

  async retire(topic: string): Promise<void> {
    if (!validTopic(topic)) throw new Error('Invalid session retirement topic.');
    await super.updateAndWait('retiredTopics', (current) => {
      const record = readRecord(current);
      return { ...record, topics: [...new Set([...record.topics, topic])] };
    }, undefined, false);
  }
}
