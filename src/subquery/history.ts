import axios from 'axios';
// import { gql } from '@urql/core';
import type { HistoryItem } from '@/interfaces/history';

// const historyElementsQuery = gql`
//   query HistoryElements($address: Str = "", $first: Int = pageSize, $after: Cursor = cursor) {
//     historyElements(after: $after, first: $first, orderBy: TIMESTAMP_DESC, filter: { address: { equalTo: $address } }) {
//       pageInfo {
//         startCursor
//         endCursor
//       }
//       nodes {
//         id
//         timestamp
//         address
//         reward
//         extrinsic
//         transfer
//       }
//     }
//   }
// `;

async function loadHistory(
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

export { loadHistory };
