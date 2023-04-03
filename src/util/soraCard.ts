import { FPNumber } from '@sora-substrate/util';
import axios from 'axios';

type XorRestPrice = {
  euroToPay: string;
  euroToPayInXor: string;
};

const getXorPerEuroRatio = async () => {
  try {
    const { data } = await axios.get('https://backend.dev.sora-card.tachi.soramitsu.co.jp/prices/xor_euro');

    return data.price;
  } catch (error) {
    console.error(error);
  }
};

const calculateXorBalanceInEuros = (xorPerEuroFP: FPNumber, xorTotalBalance: FPNumber): number => {
  try {
    const euroBalance = new FPNumber(xorTotalBalance).mul(xorPerEuroFP).toNumber();

    return euroBalance;
  } catch (error) {
    console.error(error);

    return 0;
  }
};

const calculateXorRestPrice = (xorPerEuroFP: FPNumber, xorTotalBalance: FPNumber): XorRestPrice => {
  const euroToPay = FPNumber.HUNDRED.add(FPNumber.ONE).sub(xorTotalBalance.mul(xorPerEuroFP));
  const euroToPayInXor = euroToPay.div(xorPerEuroFP);

  return {
    euroToPay: euroToPay.toString(),
    euroToPayInXor: euroToPayInXor.toString(),
  };
};

export { getXorPerEuroRatio, calculateXorBalanceInEuros, calculateXorRestPrice, XorRestPrice };
