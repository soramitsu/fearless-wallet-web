import axios from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HistoryElement } from '@/interfaces';
import { fetchHistory } from '@/history/fetchingHistory';

vi.mock('@/extension/messaging', () => ({
  getHistory: vi.fn(),
  toggleFavoriteNetwork: vi.fn(),
}));

vi.mock('@/extension/messaging/price', () => ({
  getFiats: vi.fn(),
}));

const URL = 'https://api.etherscan.io/v2/api?chainid=1';
const ADDRESS = '0x' + '11'.repeat(20);

// An Etherscan row; txlist adds isError and txreceipt_status, tokentx has neither.
const row = (status: { isError?: string; txreceipt_status?: string } = {}) => ({
  blockNumber: '16',
  timeStamp: '1700000000',
  hash: '0x' + 'ab'.repeat(32),
  from: ADDRESS,
  to: '0x' + '22'.repeat(20),
  value: '1000000000000000',
  gasPrice: '1000000000',
  gasUsed: '21000',
  ...status,
});

function explorer(result: ReturnType<typeof row>[]) {
  return vi.spyOn(axios, 'get').mockResolvedValue({ status: 200, data: { status: '1', message: 'OK', result } });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Etherscan history', () => {
  it('lists a transaction that failed on chain as failed', async () => {
    explorer([
      row({ isError: '0', txreceipt_status: '1' }),
      row({ isError: '1', txreceipt_status: '0' }),
      row({ isError: '1', txreceipt_status: '1' }),
      row({ isError: '0', txreceipt_status: '0' }),
      // A receipt from before Byzantium has no status.
      row({ isError: '0', txreceipt_status: '' }),
    ]);

    const history = (await fetchHistory(URL, ADDRESS, 'etherscan', 'Ethereum' as never, 'eth', true)) as HistoryElement[];

    expect(history.map(({ success }) => success)).toEqual([true, false, false, false, true]);
  });

  it('keeps a token transfer, which has no status fields, a success', async () => {
    const get = explorer([row()]);
    const token = '0x' + '33'.repeat(20);

    const history = (await fetchHistory(URL, ADDRESS, 'etherscan', 'Ethereum' as never, token, false)) as HistoryElement[];

    expect(get.mock.calls[0][1]?.params).toMatchObject({ action: 'tokentx' });
    expect(history.map(({ success }) => success)).toEqual([true]);
  });
});
