import axios from 'axios';
import type { HistoryItem } from '@/interfaces/history';

export async function loadHistory(
  url: string,
  address: string,
  pageSize: number,
  cursor: string | null
): Promise<HistoryItem> {
  const {
    data: { data },
  } = await axios.post(url, {
    query: `{
        historyElements(
          after: ${cursor},
          first: ${pageSize},
          orderBy: TIMESTAMP_DESC,
          filter: {
            address:{equalTo:"${address}"}
          }
        ) {
          pageInfo {
            startCursor,
            endCursor
          },
          nodes {
            id
            timestamp
            address
            reward
            extrinsic
            transfer
          }
        }
      }`,
  });

  return data?.historyElements;
}
