import { FPNumber } from '@sora-substrate/util';
import { state } from '../../background/handlers';

// export async function validateCountAssets(_count: string, fee: string, network: string): Promise<boolean> {
//   try {
//     const count = _count === '' ? '0' : _count;

//     const transferableCountAssetsMinusFee = await getTransferableCountAssetsMinusFee(fee, network);

//     if (FPNumber.isEqualTo(transferableCountAssetsMinusFee, FPNumber.ZERO)) return false;

//     return FPNumber.lte(new FPNumber(count), transferableCountAssetsMinusFee);
//   } catch {
//     return false;
//   }
// }

// async function getTransferableCountAssetsMinusFee(fee: string, asset: string, _network: string): Promise<FPNumber> {
//   const { details: walletBalances } = await state.getBalance();
//   const token = walletBalances[asset];
//   const { total, type } = token.balances.find(({ name }) => name === _network)!;
//   const _total = new FPNumber(total ?? '0');
//   const FPFee = new FPNumber(fee, token.precision);
//   const result = type === 'native' ? _total.sub(FPFee) : _total; // for ORML assets fee sub from utility asset

//   return FPNumber.lt(result, FPNumber.ZERO) ? FPNumber.ZERO : result;
// }
