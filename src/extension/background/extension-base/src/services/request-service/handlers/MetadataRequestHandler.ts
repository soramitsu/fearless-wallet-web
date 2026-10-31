import { knownMetadata, addMetadata } from '@polkadot/extension-chains';
import { type MetadataDef } from '@polkadot/extension-inject/types';
import { BehaviorSubject } from 'rxjs';
import MetadataStore from '@extension-base/stores/Metadata';
import { getId } from '@extension-base/utils';
import { type RequestService } from '@extension-base/services';
import { extractMetadata } from '@extension-base/services/request-service/helper';
import type { MetaRequest, Resolver, MetadataRequest } from '@extension-base/background/types/types';
import type { HexString } from '@polkadot/util/types';

export class MetadataRequestHandler {
  private readonly requestService: RequestService;
  private readonly metaStore: MetadataStore = new MetadataStore();
  readonly metaRequests: Record<string, MetaRequest> = {};
  public readonly metaSubject = new BehaviorSubject<MetadataRequest[]>([]);

  constructor(requestService: RequestService) {
    this.requestService = requestService;

    extractMetadata(this.metaStore);
  }

  public get knownMetadata(): MetadataDef[] {
    return knownMetadata();
  }

  public get allMetaRequests(): MetadataRequest[] {
    return Object.values(this.metaRequests).map(({ id, request, url }): MetadataRequest => ({ id, request, url }));
  }

  public get numMetaRequests(): number {
    return Object.keys(this.metaRequests).length;
  }

  public getMetaRequest(id: string): MetaRequest {
    return this.metaRequests[id];
  }

  public saveMetadata(meta: MetadataDef): void {
    const genesisHash = meta.genesisHash.toLowerCase() as HexString;
    const definition = { ...meta, genesisHash };

    // One entry per chain. One kept under another letter case is removed from storage; the chains registry cannot
    // drop it, so until the next start it holds the approved definition too.
    for (const { genesisHash: key } of knownMetadata()) {
      if (key === genesisHash || key.toLowerCase() !== genesisHash) continue;
      this.metaStore.remove(key);
      addMetadata({ ...definition, genesisHash: key });
    }

    this.metaStore.set(genesisHash, definition);

    addMetadata(definition);
  }

  private updateIconMeta(shouldClose?: boolean): void {
    this.metaSubject.next(this.allMetaRequests);
    this.requestService.updateIcon(shouldClose);
  }

  private metaComplete = (
    id: string,
    resolve: (result: boolean) => void,
    reject: (error: Error) => void
  ): Resolver<boolean> => {
    const complete = (): void => {
      delete this.metaRequests[id];
      this.updateIconMeta(true);
    };

    return {
      reject: (error: Error): void => {
        complete();
        reject(error);
      },
      resolve: (result: boolean): void => {
        complete();
        resolve(result);
      },
    };
  };

  public injectMetadata(url: string, request: MetadataDef): Promise<boolean> {
    return new Promise((resolve, reject): void => {
      // Signing matches a genesis hash in any letter case, so metadata is kept under the lower-case one.
      if (typeof request?.genesisHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(request.genesisHash))
        throw new Error('Invalid metadata genesis hash');

      const id = getId();

      this.metaRequests[id] = {
        ...this.metaComplete(id, resolve, reject),
        id,
        request: { ...request, genesisHash: request.genesisHash.toLowerCase() as HexString },
        url,
      };

      this.updateIconMeta();
      this.requestService.popupOpen();
    });
  }

  public resetWallet() {
    for (const request of Object.values(this.metaRequests)) request.reject(new Error('Reset wallet'));

    this.metaSubject.next([]);
  }
}
