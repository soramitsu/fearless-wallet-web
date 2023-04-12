import { isFunction } from '@polkadot/util';
import { api as apiSora, FPNumber } from '@sora-substrate/util';
import { LiquiditySourceTypes } from '@sora-substrate/liquidity-proxy';
import { DexId } from '@sora-substrate/util/build/dex/consts';
import type {
  Balances,
  BalanceFP,
  WalletBalance,
  RelayChainName,
  NetworkName,
  SwapOptions,
  ExtrinsicOptions,
  UpdateBalanceProps,
  CreateSwapResult,
} from '@/interfaces';
import type { SubmittableExtrinsic } from '@polkadot/api/submittable/types';
import type { Wallet, SetHistoryProps } from '@/store';
import type { Asset } from '@sora-substrate/util/build/assets/types';
import type { XorRestPrice } from '@/util/soraCard';
import BaseApi from '@/util/BaseApi';
import { NetworksController } from '@/controllers';
import { LocalStorage } from '@/controllers/localStorageController';
import {
  XCM_NATIVE_PALLETS,
  FOUR_INSTRUCTIONS_PARACHAIN_WEIGHT,
  getNativeTeleportParams,
  getOrmlTeleportParams,
  isNativeNetwork,
  getOrmlOptions,
} from '@/util/teleport';
import { getReplacedMetaTyped } from '@/helpers/common';
import { statusLogging } from '@/helpers/currencies';
import { createExtrinsicTransfer, getAssetOptions } from '@/util/assets';
import { BeaconSigner } from '@/extension/background/extension-base/src/background/BeaconSigner';
import store from '@/store';
import { MutationTypes as NetworksMutationTypes } from '@/store/networks/mutations';
import { MOCK_BALANCE, MOCK_FP_BALANCE } from '@/consts/currencies';
import { saveTimeoutCache } from '@/extension/messaging';
import { SORA_NETWORK_NAME, SORA_UTILITY_ASSET } from '@/consts/networks';
import { addNumbers } from '@/helpers/numbers';
import { getXorPerEuroRatio, calculateXorBalanceInEuros, calculateXorRestPrice } from '@/util/soraCard';

type TransactionStatus = 'success' | 'failed' | 'pending';

export class CurrencyController {
  private readonly lsCurrency = new LocalStorage('currency');
  private readonly visibleStorageName = 'visible';
  public extrinsic!: SubmittableExtrinsic<'promise'> | undefined;
  public extrinsicOptions: ExtrinsicOptions = {};
  public xorPerEuroRatio!: FPNumber;
  public price = 0;
  public hours24Change = 0;
  public currenciesVisible!: Record<string, Record<string, boolean>>;
  public transactionStatus?: TransactionStatus;

  /**
   * Create a currency item.
   * @param {string} mainNetwork - the network in which the asset is a utility
   * @param {string} assetId - asset id
   * @param {string} assetFullName - asset full name
   * @param {string} asset - asset ticker (same symbol)
   * @param {string[]} providers - list of providers
   * @param {string} relayChain - relay chain name (polkadot | kusama)
   * @param {Balances} balances - asset balance
   * @param {string} icon - asset icon
   * @param {string} displayName - asset display name (example: asset = KSM, displayName = KSM and asset = KSM, displayName = vKSM)
   */
  constructor(
    public mainNetwork: string,
    public assetId: string,
    public assetFullName: string,
    public asset: string,
    public providers: string[],
    public relayChain: RelayChainName,
    public balances: Balances,
    public icon: string,
    public displayName: string
  ) {
    this.currenciesVisible = this.lsCurrency.get(this.visibleStorageName).value ?? {};
  }

  /**
   * Update fiat price
   */
  public updatePrice() {
    const { price, hours24Change } = NetworksController.getAssetPrice(this.displayName);

    this.price = price ?? 0;
    this.hours24Change = hours24Change ?? 0;
  }

  /**
   * Calculate cost by quantity
   * @param {FPNumber} count
   * @returns {FPNumber}
   */
  private calculateCost(count: FPNumber): FPNumber {
    const FPPrice = new FPNumber(this.price);

    return count.mul(FPPrice);
  }

  /**
   * Get wallet balance
   * @param {Wallet} wallet
   * @returns {WalletBalance[]}
   */
  private getWalletBalance(wallet: Wallet): WalletBalance[] {
    const { address, ethereumAddress } = wallet;

    const replacedAccounts = BaseApi.getReplacedAccounts(wallet);
    const replacedNetworks = replacedAccounts.reduce((result, { address: _address, meta }) => {
      const { replacedSettings } = getReplacedMetaTyped(meta);
      const replacedNetworks = replacedSettings[address] ?? replacedSettings[ethereumAddress];

      replacedNetworks.forEach((network) => (result[network] = _address));

      return result;
    }, {} as Record<string, string>);

    return this.balances.map((item) => {
      const { network, type, precision, existentialDeposit, balance, assetId } = item;
      const isEthereumNetwork = BaseApi.isEthereumNetwork(network);
      const replacedAddress = replacedNetworks[network];
      const walletBalance = replacedAddress
        ? balance[replacedAddress]
        : isEthereumNetwork
        ? balance[ethereumAddress]
        : balance[address];

      return {
        network,
        type,
        precision,
        existentialDeposit,
        balance: walletBalance ?? MOCK_FP_BALANCE,
        assetId,
      };
    });
  }

  /**
   * Count the number of assets in all networks
   * @param {Wallet} wallet
   * @returns {BalanceFP}
   */
  private calculateCountAssets(wallet: Wallet): BalanceFP {
    const walletBalance = this.getWalletBalance(wallet);

    return walletBalance.reduce((obj, { balance: { total, frozen, locked, reserved, transferable } }) => {
      return {
        total: obj.total.add(total),
        frozen: obj.frozen.add(frozen),
        locked: obj.locked.add(locked),
        reserved: obj.reserved.add(reserved),
        transferable: obj.transferable.add(transferable),
      };
    }, MOCK_FP_BALANCE);
  }

  /**
   * Get total fiat balance of wallet in network
   * @param {Wallet} wallet
   * @param {NetworkName} _network
   * @returns {string}
   */
  private getFiatBalanceInNetwork(wallet: Wallet, _network: NetworkName, type: keyof BalanceFP): string {
    const walletBalance = this.getWalletBalance(wallet);
    const balance = walletBalance.find(({ network }) => network === _network)?.balance[type] ?? FPNumber.ZERO;

    return this.calculateCost(balance).toString();
  }

  /**
   * Get balance of wallet assets in network
   * @param {Wallet} wallet
   * @param {NetworkName} _network
   */
  public getBalanceInNetwork(wallet: Wallet, _network: string) {
    const walletBalance = this.getWalletBalance(wallet);
    const balance = walletBalance.find(({ network }) => network === _network)?.balance;

    if (balance === undefined) return MOCK_BALANCE;

    const { frozen, locked, reserved, total, transferable } = balance;

    return {
      frozen: {
        value: frozen.toString(),
        fiat: this.calculateCost(frozen).toString(),
      },
      locked: {
        value: locked.toString(),
        fiat: this.calculateCost(locked).toString(),
      },
      reserved: {
        value: reserved.toString(),
        fiat: this.calculateCost(reserved).toString(),
      },
      total: {
        value: total.toString(),
        fiat: this.calculateCost(total).toString(),
      },
      transferable: {
        value: transferable.toString(),
        fiat: this.calculateCost(transferable).toString(),
      },
    };
  }

  /**
   * Get transaction address for wallet(taking network and replaced wallet)
   * @param {Wallet} wallet
   * @param {NetworkName} network
   * @returns {string}
   */
  public getTransactionAddress(wallet: Wallet, network: NetworkName): string {
    const { address, ethereumAddress } = wallet;
    const replacedAccount = BaseApi.getReplacedAccountByNetwork(wallet, network);

    if (replacedAccount) {
      const { address } = replacedAccount;

      return address;
    }

    return BaseApi.isEthereumNetwork(network) ? ethereumAddress : address;
  }

  /**
   * Update asset balance
   * @param {UpdateBalanceProps} props
   */
  public updateCurrencyBalance({ walletAddress, network, balance }: UpdateBalanceProps): void {
    const { frozen, locked, reserved, total, transferable } = balance;
    const oldBalances = [...this.balances];
    const indexNetwork = oldBalances.findIndex(({ network: _network }) => _network === network);
    const balancesForNetwork = oldBalances[indexNetwork];

    const newBalance = {
      frozen: FPNumber.fromCodecValue(frozen, balancesForNetwork.precision),
      locked: FPNumber.fromCodecValue(locked, balancesForNetwork.precision),
      reserved: FPNumber.fromCodecValue(reserved, balancesForNetwork.precision),
      total: FPNumber.fromCodecValue(total, balancesForNetwork.precision),
      transferable: FPNumber.fromCodecValue(transferable, balancesForNetwork.precision),
    };

    balancesForNetwork.balance[walletAddress] = newBalance;

    this.balances.splice(indexNetwork, 1, balancesForNetwork);

    NetworksController.setNetworkZeroBalance(walletAddress, network, this.assetId, newBalance.total.isZero());
  }

  /**
   * Get total count assets by network
   * @param {Wallet} wallet
   * @param {NetworkName} network
   * @returns {string}
   */
  public getTotalCountAssets(wallet: Wallet, network?: NetworkName): string {
    if (network && network !== 'all') {
      return this.getBalanceInNetwork(wallet, network).total.value;
    }

    return this.calculateCountAssets(wallet).total.toString();
  }

  /**
   * Get transferable count assets by network
   * @param {Wallet} wallet
   * @param {NetworkName} network
   * @returns {string}
   */
  public getTransferableCountAssets(wallet: Wallet, network: NetworkName): string {
    if (network && network !== 'all') {
      return this.getBalanceInNetwork(wallet, network).transferable.value;
    }

    return this.calculateCountAssets(wallet).transferable.toString();
  }

  /**
   * Get transferable fiat balance by network
   * @param {Wallet} wallet
   * @param {NetworkName} network
   * @returns {string}
   */
  public getTransferableFiatBalance(wallet: Wallet, network?: NetworkName): string {
    if (network && network !== 'all') {
      return this.getFiatBalanceInNetwork(wallet, network, 'transferable');
    }

    const transferableCountAssets = this.calculateCountAssets(wallet).transferable;

    return this.calculateCost(transferableCountAssets).toString();
  }

  /**
   * Get transferable count assets by network minus fee
   * @param {Wallet} wallet
   * @param {NetworkName} _network
   * @returns {FPNumber}
   */
  public getTransferableCountAssetsMinusFee(fee: string, _network: NetworkName, wallet: Wallet): FPNumber {
    const walletBalance = this.getWalletBalance(wallet);
    const {
      precision,
      balance: { transferable },
      type,
    } = walletBalance.find(({ network }) => network === _network)!;
    const FPFee = new FPNumber(fee, precision);
    const result = type === 'native' ? transferable.sub(FPFee) : transferable; // for ORML assets fee sub from utility asset

    return FPNumber.lt(result, FPNumber.ZERO) ? FPNumber.ZERO : result;
  }

  /**
   * Validate count assets
   * @param {string} count
   * @param {string} fee
   * @param {NetworkName} network
   * @param {Wallet} wallet
   * @returns {boolean}
   */
  public validateCountAssets(_count: string, fee: string, network: NetworkName, wallet: Wallet): boolean {
    try {
      const count = _count === '' ? '0' : _count;

      const transferableCountAssetsMinusFee = this.getTransferableCountAssetsMinusFee(fee, network, wallet);

      if (FPNumber.isEqualTo(transferableCountAssetsMinusFee, FPNumber.ZERO)) return false;

      return FPNumber.lte(new FPNumber(count), transferableCountAssetsMinusFee);
    } catch {
      return false;
    }
  }

  /**
   * Get list of networks for asset
   * @returns {Balances}
   */
  public getNetworkList(): Balances {
    return this.balances;
  }

  /**
   * Check if this is utility asset for network
   * @param {NetworkName} _network
   * @returns {Balances}
   */
  public isUtility(_network: NetworkName): boolean {
    return this.balances.find(({ network }) => network === _network)?.type === 'native';
  }

  /**
   * Get a list of networks with a balance
   * @param {Wallet} wallet
   * @returns {WalletBalance[]}
   */
  public getNetworksWithBalance(wallet: Wallet): WalletBalance[] {
    return this.getWalletBalance(wallet).filter(({ balance: { total } }) => !FPNumber.isEqualTo(total, FPNumber.ZERO));
  }

  /**
   * Get asset cost
   * @param {string} count
   * @returns {string}
   */
  public getCostOfAssets(count: string): string {
    return this.calculateCost(new FPNumber(count)).toString();
  }

  /**
   * Get count of assets by total price
   * @param {string} cost
   * @returns {string}
   */
  public getCountAssetsByPrice(cost: string): string {
    const FPCost = new FPNumber(cost);
    const price = new FPNumber(this.price);

    return FPCost.div(price).toString();
  }

  /**
   * Get currency visibility
   * @param {string} address
   * @returns {boolean}
   */
  public getCurrencyVisibility(address: string): boolean {
    return this.currenciesVisible?.[address]?.[this.assetId] ?? true;
  }

  /**
   * Set currency visibility
   * @param {string} address
   * @param {boolean} value
   */
  public setCurrencyVisibility(address: string, value: boolean): void {
    this.currenciesVisible = this.lsCurrency.get(this.visibleStorageName).value ?? {};

    if (this.currenciesVisible[address]) this.currenciesVisible[address][this.assetId] = value;
    else {
      this.currenciesVisible[address] = {};
      this.currenciesVisible[address][this.assetId] = value;
    }

    this.lsCurrency.set(this.visibleStorageName, this.currenciesVisible);
  }

  /**
   * Get currency visibility
   * @param {string} _amount
   * @param {number} precision
   * @param {boolean} [returnFPNumber=false] return FPNumber or string value
   * @returns {string | FPNumber}
   */
  public getPrecisionValue(_amount: string, precision: number, returnFPNumber = false): string | FPNumber {
    const amount = _amount === '' ? '0' : _amount;
    const amountFP = new FPNumber(amount, precision);

    return returnFPNumber ? amountFP : amountFP.toCodecString();
  }

  /**
   * Validation for Existential Deposit
   * @param {Wallet} wallet
   * @param {NetworkName} _network
   * @param {string} amount
   * @param {string} fee
   * @returns {boolean}
   */
  public validateExistentialDeposit(wallet: Wallet, _network: NetworkName, amount: string, fee: string): boolean {
    const walletBalance = this.getWalletBalance(wallet);
    const {
      existentialDeposit,
      precision,
      balance: { transferable },
      type,
    } = walletBalance.find(({ network }) => network === _network)!;
    const { api } = NetworksController.getNetwork(_network);
    const exDeposit =
      existentialDeposit ??
      (type === 'equilibrium' ? api?.consts.eqBalances : api?.consts.balances)?.existentialDeposit.toString();

    if (exDeposit === undefined) return true;

    const amountFP = this.getPrecisionValue(amount, precision, true) as FPNumber;
    const feeFP = new FPNumber(fee, precision);
    const residualBalance = transferable.sub(amountFP).sub(feeFP);

    return FPNumber.gte(residualBalance, FPNumber.fromCodecValue(exDeposit, precision));
  }

  /**
   * Create transfer extrinsic
   * @param {Wallet} wallet
   * @param {string} to
   * @param {string} amount
   * @param {NetworkName} networkName
   */
  public async createTransferExtrinsic(
    wallet: Wallet,
    to: string,
    amount: string,
    networkName: NetworkName
  ): Promise<void> {
    const network = NetworksController.getNetwork(networkName);
    const {
      api,
      settings: { DefaultTip },
    } = network;

    if (api === undefined) return;

    const walletBalance = this.getWalletBalance(wallet) ?? [];
    const networkProps = walletBalance.find(({ network }) => network === networkName)!;

    this.extrinsic = createExtrinsicTransfer({ api, to, amount, asset: this.asset, networkProps });
    this.extrinsicOptions = this.extrinsic
      ? {
          transactionsOptions: { tip: DefaultTip },
          historyOptions: { networkProps, amount, to },
          api,
        }
      : {};

    await this.getPartialFee(wallet, networkName);
  }

  /**
   * Create teleport extrinsic
   * @param {Wallet} wallet
   * @param {NetworkName} originNet
   * @param {NetworkName} destNet
   * @param {string} amount
   */
  public async createTeleportExtrinsic(
    wallet: Wallet,
    originNet: NetworkName,
    destNet: NetworkName,
    amount: string
  ): Promise<void> {
    const walletBalance = this.getWalletBalance(wallet) ?? [];
    const networkProps = walletBalance.find(({ network }) => network === originNet)!;
    const toAddress = this.getTransactionAddress(wallet, destNet);

    if (isNativeNetwork(originNet)) {
      // Case RelayChain -> Nonnative ParaChain (polkadot -> acala, etc; kusama -> bifrost, etc) paraId = 2000-2999, pallet = xcmPallet, module = reserveTransferAssets
      // Case RelayChain -> Native ParaChain (polkadot -> statemint; kusama -> statemine, encointer) paraId = 1000-1999, pallet = xcmPallet, module = limitedTeleportAssets
      // Case Native ParaChain -> RelayChain (statemint -> polkadot; statemine, encointer -> kusama) paraId = -1, pallet = polkadotXcm, module = limitedTeleportAssets
      // TODO: add case: Native ParaChain -> Nonnative ParaChain
      // TODO: add case: Native ParaChain -> Native ParaChain
      this.createNativeTeleportExtrinsic(originNet, destNet, toAddress, amount, networkProps);
    } else {
      // Case Nonnative ParaChain -> Nonnative ParaChain (karura, etc -> bifrost, etc) paraId = 2000-2999
      // Case Nonnative ParaChain -> RelayChain (karura, etc -> kusama, etc; acala, etc  -> polkadot)
      this.createOrmlTeleportExtrinsic(originNet, destNet, toAddress, amount, networkProps);
    }

    await this.getPartialFee(wallet, originNet);
  }

  /**
   * Create native teleport extrinsic
   * @param {NetworkName} originNet
   * @param {NetworkName} destNet
   * @param {string} toAddress
   * @param {string} amount
   * @param {WalletBalance} networkProps
   */
  public async createNativeTeleportExtrinsic(
    originNet: NetworkName,
    destNet: NetworkName,
    toAddress: string,
    amount: string,
    networkProps: WalletBalance
  ): Promise<void> {
    const { api } = NetworksController.getNetwork(originNet);

    if (api === undefined) return;

    const precisionAmount = this.getPrecisionValue(amount, networkProps.precision) as string;
    const module = isNativeNetwork(destNet) ? 'limitedTeleportAssets' : 'reserveTransferAssets';
    const pallet = XCM_NATIVE_PALLETS.find((pallet) => api!.tx[pallet] && isFunction(api!.tx[pallet][module]))!;
    const tx = api!.tx[pallet][module];
    const params = getNativeTeleportParams(destNet, toAddress, precisionAmount);

    this.extrinsic = tx(...params);
    this.extrinsicOptions = { historyOptions: { networkProps, amount: precisionAmount, to: toAddress }, api };
  }

  /**
   * Create orml teleport extrinsic
   * @param {string} originNet
   * @param {string} destNet
   * @param {string} toAddress
   * @param {string} amount
   * @param {WalletBalance} networkProps
   */
  public async createOrmlTeleportExtrinsic(
    originNet: string,
    destNet: string,
    toAddress: string,
    amount: string,
    networkProps: WalletBalance
  ): Promise<void> {
    const { api } = NetworksController.getNetwork(originNet);

    if (api === undefined) return;

    const precisionAmount = this.getPrecisionValue(amount, networkProps.precision) as string;
    const ormlOptions = getOrmlOptions(this.asset, originNet);
    const params = getOrmlTeleportParams(originNet, destNet, toAddress);

    this.extrinsic = api!.tx.xTokens.transfer(ormlOptions, precisionAmount, params, FOUR_INSTRUCTIONS_PARACHAIN_WEIGHT);
    this.extrinsicOptions = { historyOptions: { networkProps, amount: precisionAmount, to: toAddress }, api };
  }

  /**
   * Validate swap to XOR
   * @param {Wallet} wallet
   * @param {string} receiveAmount
   * @param {string} receiveAmount
   * @returns {boolean}
   */
  public validateSwapToXOR(wallet: Wallet, receiveAmount: string, fee: string): boolean {
    const transferableXOR = this.getTransferableCountAssets(wallet, SORA_NETWORK_NAME);
    const transferableXORAfterSending = addNumbers([transferableXOR, receiveAmount]);

    return FPNumber.gt(new FPNumber(transferableXORAfterSending), new FPNumber(fee));
  }

  /**
   * Get XOR per Euro ratio
   * @returns {Promise<void>}
   */
  public async getXorPerEuroRatio(): Promise<void> {
    if (this.asset !== SORA_UTILITY_ASSET) throw Error('');

    const xorPerEuro = await getXorPerEuroRatio();

    this.xorPerEuroRatio = FPNumber.fromNatural(xorPerEuro);
  }

  /**
   * Calculate euro balance, only for XOR
   * @param {Wallet} wallet
   * @param {NetworkName} network
   * @returns {Promise<number>}
   */
  public calculateEuroBalance(wallet: Wallet, network: NetworkName): number {
    if (this.asset !== SORA_UTILITY_ASSET) throw Error('');

    const xorTotalBalance = new FPNumber(this.getTotalCountAssets(wallet, network));
    const xorBalanceInEuros = calculateXorBalanceInEuros(this.xorPerEuroRatio, xorTotalBalance);

    return xorBalanceInEuros;
  }

  /**
   * Calculate XOR rest price
   * @param {Wallet} wallet
   * @param {NetworkName} network
   * @returns {XorRestPrice}
   */
  public calculateXorRestPrice(wallet: Wallet, network: NetworkName): XorRestPrice {
    const xorTotalBalance = new FPNumber(this.getTotalCountAssets(wallet, network));
    const xorRestPrice = calculateXorRestPrice(this.xorPerEuroRatio, xorTotalBalance);

    return xorRestPrice;
  }

  /**
   * Validate XOR balance for Sora Card(100 euro)
   * @param {number} xorBalanceInEuros
   * @returns {number}
   */
  public isValidXorBalanceForSoraCard(xorBalanceInEuros: number): boolean {
    return FPNumber.gte(new FPNumber(xorBalanceInEuros), FPNumber.HUNDRED);
  }

  /**
   * Create swap extrinsic
   * @param {Partial<SwapOptions>} options
   * @returns {Promise<CreateSwapResult>}
   */
  public async createSwap(options: Partial<SwapOptions>): Promise<CreateSwapResult> {
    const { assetAId, assetBId, isExchangeB, amountA, amountB, symbolA, symbolB, slippage, marketType } = options;
    const assetAAddress = getAssetOptions('', 'soraAsset', assetAId!) as string;
    const assetBAddress = getAssetOptions('', 'soraAsset', assetBId!) as string;
    const amountWithDirection = (isExchangeB ? amountB : amountA) as string;
    const liquiditySource =
      marketType === 'smart' ? LiquiditySourceTypes.Default : LiquiditySourceTypes.MulticollateralBondingCurvePool;
    const assetA: Asset = { address: assetAAddress, decimals: 18, name: symbolA!, symbol: symbolA! };
    const assetB: Asset = {
      address: assetBAddress,
      decimals: 18,
      name: symbolB!,
      symbol: symbolB!,
    };

    const {
      amount: amountDexIdXOR,
      fee: providerFeeDexIdXOR,
      route: routeDexIdXOR,
    } = await apiSora.swap.getResultFromBackend(
      assetAAddress,
      assetBAddress,
      amountWithDirection,
      isExchangeB,
      liquiditySource,
      DexId.XOR
    );

    const {
      amount: amountDexIdXSTUSD,
      fee: providerFeeDexIdXSTUSD,
      route: routeDexIdXSTUSD,
    } = await apiSora.swap.getResultFromBackend(
      assetAAddress,
      assetBAddress,
      amountWithDirection,
      isExchangeB,
      liquiditySource,
      DexId.XSTUSD
    );

    const swapOptions = { ...options, assetA, assetB } as SwapOptions;
    const amountDexIdXORFP = FPNumber.fromCodecValue(amountDexIdXOR);
    const amountDexIdXSTUSDFP = FPNumber.fromCodecValue(amountDexIdXSTUSD);

    let isDexXor;
    let expectedAmount;
    let providerFee;
    let route;

    if (amountDexIdXORFP.isZero()) {
      isDexXor = false;
      expectedAmount = amountDexIdXSTUSDFP;
      providerFee = providerFeeDexIdXSTUSD;
      route = routeDexIdXSTUSD;
    } else if (amountDexIdXSTUSDFP.isZero()) {
      isDexXor = true;
      expectedAmount = amountDexIdXORFP;
      providerFee = providerFeeDexIdXOR;
      route = routeDexIdXOR;
    } else {
      isDexXor = isExchangeB
        ? FPNumber.lt(amountDexIdXORFP, amountDexIdXSTUSDFP)
        : FPNumber.gt(amountDexIdXORFP, amountDexIdXSTUSDFP);
      expectedAmount = isDexXor ? amountDexIdXORFP : amountDexIdXSTUSDFP;
      providerFee = isDexXor ? providerFeeDexIdXOR : providerFeeDexIdXSTUSD;
      route = isDexXor ? routeDexIdXOR : routeDexIdXSTUSD;
    }

    route =
      route
        ?.map((item) => {
          const assetsJson = NetworksController.getAssetsJson();
          const { symbol } = assetsJson.find(({ currencyId }) => currencyId === item)!;

          return symbol.toUpperCase();
        })
        .join(' > ') ?? '';

    if (isExchangeB) {
      const minMaxValue = apiSora.swap.getMinMaxValue(
        assetA,
        assetB,
        expectedAmount.toString(),
        amountB!,
        isExchangeB,
        slippage!
      );

      this.extrinsicOptions.swapOptions = {
        ...swapOptions,
        amountA: expectedAmount.toString(),
        amountB: amountB!,
        swapDexId: isDexXor ? DexId.XOR : DexId.XSTUSD,
      };

      return {
        amountA: expectedAmount.toString(),
        amountB: amountB!,
        AToB: expectedAmount.div(new FPNumber(amountB!)).toString(),
        BToA: new FPNumber(amountB!).div(expectedAmount).toString(),
        minMaxValue: FPNumber.fromCodecValue(minMaxValue).toString(),
        providerFee: FPNumber.fromCodecValue(providerFee).toString(),
        route,
      };
    } else {
      const minMaxValue = apiSora.swap.getMinMaxValue(
        assetA,
        assetB,
        amountA!,
        expectedAmount.toString(),
        isExchangeB!,
        slippage!
      );

      this.extrinsicOptions.swapOptions = {
        ...swapOptions,
        amountA: amountA!,
        amountB: expectedAmount.toString(),
        swapDexId: isDexXor ? DexId.XOR : DexId.XSTUSD,
      };

      return {
        amountA: amountA!,
        amountB: expectedAmount.toString(),
        AToB: new FPNumber(amountA!).div(expectedAmount).toString(),
        BToA: expectedAmount.div(new FPNumber(amountA!)).toString(),
        minMaxValue: FPNumber.fromCodecValue(minMaxValue).toString(),
        providerFee: FPNumber.fromCodecValue(providerFee).toString(),
        route,
      };
    }
  }

  /**
   * Create swap extrinsic
   * @param {string} from
   */
  public async sendSwap(from: string, isSavePass: boolean): Promise<void> {
    if (BaseApi.isExtension()) saveTimeoutCache(from, isSavePass);

    const { isExchangeB, swapDexId, amountA, amountB, slippage, assetA, assetB } = this.extrinsicOptions.swapOptions!;

    const pair = BaseApi.getPair(from);

    apiSora.account = { json: null as any, pair };

    this.setTransactionStatus('pending');

    try {
      await apiSora.swap.execute(
        assetA,
        assetB,
        amountA,
        amountB,
        slippage,
        isExchangeB,
        LiquiditySourceTypes.Default,
        swapDexId
      );
    } catch (ex) {
      this.setTransactionStatus('failed');

      console.info(`Swap transaction failed ${ex}`);
    }

    this.setTransactionStatus('success');
  }

  /**
   * Get extrinsic fee
   * @param {Wallet} wallet
   * @param {NetworkName} _network
   * @returns {Promise<string>}
   */
  public async getPartialFee(wallet: Wallet, _network: NetworkName): Promise<void> {
    if (!this.extrinsic) {
      this.extrinsicOptions.fee = '0';

      return;
    }

    const transactionAddress = this.getTransactionAddress(wallet, _network);
    const walletBalance = this.getWalletBalance(wallet) ?? [];
    const { precision } = walletBalance.find(({ network }) => network === _network)!;

    try {
      const { partialFee } = await this.extrinsic.paymentInfo(transactionAddress);
      const result = new FPNumber(partialFee as any, precision);

      this.extrinsicOptions.fee = result.toString();
    } catch (ex) {
      this.extrinsicOptions.fee = '0';
    }
  }

  /**
   * Send assets
   * @param {string} from
   * @param {boolean} [isMobile=false]
   * @param {boolean} [isSavePass=false]
   * @returns {Promise<boolean>}
   */
  public async send(from: string, isMobile = false, isSavePass = false): Promise<boolean> {
    if (BaseApi.isExtension()) saveTimeoutCache(from, isSavePass);

    const account = isMobile ? from : BaseApi.getPair(from);

    const nonce = (await this.extrinsicOptions.api?.rpc.system.accountNextIndex(from)) as unknown as number;

    const options = {
      ...(this.extrinsicOptions.transactionsOptions ?? {}),
      signer: isMobile ? new BeaconSigner() : undefined,
      nonce,
    };

    this.setTransactionStatus('pending');

    try {
      await this.extrinsic!.signAndSend(
        account,
        options,
        statusLogging(() => this.statusCallback(from, 'success'))
      );

      if (typeof account !== 'string' && !isSavePass) account.lock();
    } catch (ex) {
      this.statusCallback(from, 'failed');

      console.info(`Transaction failed ${ex}`);

      return false;
    }

    return true;
  }

  /**
   * Status callback
   */
  private statusCallback(from: string, status?: TransactionStatus) {
    this.setTransactionStatus(status);
    this.setMockHistory(from, status === 'success');
  }

  /**
   * Set transaction status
   */
  public setTransactionStatus(status?: TransactionStatus) {
    this.transactionStatus = status;
  }

  /**
   * Create mock history
   * @param {string} from
   * @param {boolean} success
   */
  private async setMockHistory(from: string, success: boolean): Promise<void> {
    const { historyOptions, fee } = this.extrinsicOptions;
    const {
      networkProps: { network, precision },
      amount,
      to,
    } = historyOptions!;
    const precisionAmount = this.getPrecisionValue(amount, precision) as string;

    const historyMock: SetHistoryProps = {
      assetId: this.assetId,
      networkName: network,
      isPreviously: true,
      isMock: true,
      walletAddress: from,
      serviceType: 'subquery',
      history: {
        nodes: [
          {
            address: '',
            id: '',
            timestamp: `${Date.now() / 1000}`,
            isMock: true,
            extrinsic: null,
            reward: null,
            transfer: {
              from: BaseApi.getDisplayAddressByNetwork({ address: from, ethereumAddress: from }, network),
              success,
              amount: precisionAmount,
              eventIdx: -1,
              fee: fee!,
              to,
            },
          },
        ],
        pageInfo: {
          startCursor: '',
          endCursor: '',
        },
      },
    };

    store.commit(NetworksMutationTypes.SET_HISTORY, historyMock);

    this.extrinsicOptions = {};
  }
}
