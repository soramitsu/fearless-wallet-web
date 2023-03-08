import axios from 'axios';
import type { SubqueryHistoryItem, GiantsquidHistoryItem } from '@/interfaces/history';

async function fetchSubqueryHistory(
  url: string,
  address: string,
  pageSize: number,
  cursor: string | null = null
): Promise<SubqueryHistoryItem> {
  const {
    data: { data },
  } = await axios.post(url, {
    query: `{
      historyElements(
        after: ${cursor},
        first: ${pageSize},
        orderBy: TIMESTAMP_DESC,
        filter: {
          address: {
            equalTo: "${address}"
          }
        }
      ) {
        pageInfo {
          startCursor
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

async function fetchGiantsquidHistory(url: string, address: string): Promise<GiantsquidHistoryItem> {
  const {
    data: { data },
  } = await axios.post(url, {
    query: `{
      transfers(
        where: {
          account: {
            id_eq: "${address}"
          }
        }
      ) {
        id
        direction
        transfer {
          id
          amount
          blockNumber
          extrinsicHash
          timestamp
          success
          from {
            id
          }
          to {
            id
          }
        }
      }
    }`,
  });

  return data?.transfers;
}

export { fetchSubqueryHistory, fetchGiantsquidHistory };
