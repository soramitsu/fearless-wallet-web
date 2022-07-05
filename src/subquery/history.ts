import axios from 'axios';

export async function getHistory(url: string, pageSize: number, cursor: number | null, walletAddress: string) {
  const {
    data: { data },
  } = await axios.post(url, {
    query: `{
        historyElements(
          after: ${cursor},
          first: ${pageSize},
          orderBy: TIMESTAMP_DESC,
          filter: {
            address:{equalTo:"${walletAddress}"}
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
