import EthProvider from '@extension-base/api/evm/ethProvider';

export async function getEVMBalance(
  networkKey: string,
  addresses: string[],
  web3ApiMap: Record<string, EthProvider>
): Promise<string[]> {
  const eth = web3ApiMap[networkKey];

  return await Promise.all(
    addresses.map(async (address) => {
      return await eth.getBalance(address);
    })
  );
}
