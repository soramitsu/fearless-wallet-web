import axios from 'axios';
import { chrome } from '@extension-base/utils/crossenv';

import { type GoogleFileId } from '../../background/types/types';
import type { KeyringPair$Json } from '@subwallet/keyring/types';
import type {
  FilesResponse,
  GoogleAuthTypes,
  ICreateFile,
  IGetFilesResponse,
  RequestGoogleToken,
  VerifyTokenResponse,
} from '@/interfaces';
import { isGoogleDriveBackupEnabled } from '@/util/releaseFeatures';

export class GoogleService {
  private readonly baseURL = 'https://www.googleapis.com/drive/v3';
  private readonly baseUploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  private readonly extensionRedirectURL = chrome?.identity?.getRedirectURL('welcome');
  private readonly baseAuthParams = {
    client_id: process.env.OAUTH_CLIENT_ID,
    response_type: 'token',
    access_type: 'online',
    prompt: 'consent',
    scope: 'https://www.googleapis.com/auth/drive.appdata',
  };

  urlTypes = {
    main: 'google',
    export: 'fearless/wallet',
  };

  public get config() {
    return {
      params: {
        fields: 'files(id,name,description)',
        spaces: 'appDataFolder',
      },
      headers: {
        'Content-type': 'application/json',
        Accept: 'application/json',
      },
    };
  }

  private authPending = false;

  private authURL(state: string) {
    const prepUrl = new URL(`https://accounts.google.com/o/oauth2/v2/auth`);
    const params: Record<string, string> = {
      ...this.baseAuthParams,
      state,
      redirect_uri: this.extensionRedirectURL,
    };

    Object.keys(params).forEach((key) => {
      prepUrl.searchParams.set(key, params[key]);
    });

    return prepUrl.href;
  }

  private prepareData(json: string, { name, address }: { name: string; address: string }) {
    const metadata = JSON.stringify({ name: `${name}.json`, mimeType: 'application/json', description: address, parents: ['appDataFolder'] });
    let boundary: string;
    do { boundary = `fearless-${crypto.randomUUID()}`; } while (json.includes(boundary) || metadata.includes(boundary));
    const body = [
      `--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '', metadata,
      `--${boundary}`, 'Content-Type: application/json', '', json, `--${boundary}--`, '',
    ].join('\r\n');
    return { body, boundary };
  }

  public async authExtension({ type = 'main', wallet }: GoogleAuthTypes) {
    if (!isGoogleDriveBackupEnabled()) throw new Error('google_drive_backup_unavailable');
    if (this.authPending) throw new Error('Google authorization is already in progress');
    this.authPending = true;
    try {
      const state = crypto.randomUUID();
      const token = await new Promise<string>((resolve, reject) => {
        chrome.identity.launchWebAuthFlow({ url: this.authURL(state), interactive: true }, (redirectUrl) => {
          try {
            if (chrome.runtime.lastError || !redirectUrl) throw new Error('Google authorization was not completed');
            const redirect = new URL(redirectUrl);
            const expected = new URL(this.extensionRedirectURL);
            const params = new URLSearchParams(redirect.hash.slice(1));
            const accessToken = params.get('access_token');
            if (redirect.origin !== expected.origin || redirect.pathname !== expected.pathname ||
              params.get('state') !== state || params.has('error') || !accessToken?.trim())
              throw new Error('Google authorization response was not valid');
            resolve(accessToken);
          } catch (error) { reject(error); }
        });
      });
      const popup = chrome.runtime.getURL('popup.html');
      const baseURL = `${popup}#/${this.urlTypes[type]}/${encodeURIComponent(token)}`;
      const url = type === 'export' && wallet ? `${baseURL}?wallet=${encodeURIComponent(wallet)}` : baseURL;
      const tabs = await chrome.tabs.query({});
      const openTab = tabs.find((tab) => tab.url === popup || tab.url?.startsWith(`${popup}#`));
      if (openTab?.id !== undefined) await chrome.tabs.update(openTab.id, { active: true, url });
      else await chrome.tabs.create({ active: true, url });
    } finally { this.authPending = false; }
  }

  public async getFiles({ token }: RequestGoogleToken): Promise<IGetFilesResponse> {
    const files: FilesResponse[] = [];
    const seen = new Set<string>();
    let pageToken: string | undefined;
    do {
      const { data } = await axios.get<IGetFilesResponse & { nextPageToken?: string }>(`${this.baseURL}/files`, {
        params: { ...this.config.params, fields: 'files(id,name,description),nextPageToken,incompleteSearch,kind', pageToken },
        headers: { Authorization: `Bearer ${token}`, ...this.config.headers },
      });
      if (data.incompleteSearch || (data.files !== undefined && !Array.isArray(data.files)))
        throw new Error('Google Drive backup inventory was incomplete');
      files.push(...(data.files ?? []));
      pageToken = data.nextPageToken;
      if (pageToken && (typeof pageToken !== 'string' || seen.has(pageToken)))
        throw new Error('Google Drive backup pagination was invalid');
      if (pageToken) seen.add(pageToken);
    } while (pageToken);
    return { files, incompleteSearch: false, kind: 'drive#fileList' };
  }

  public async getFile({ id, token }: GoogleFileId): Promise<KeyringPair$Json> {
    const { data } = await axios.get<KeyringPair$Json>(`${this.baseURL}/files/${encodeURIComponent(id)}?alt=media`, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...this.config.headers,
      },
    });

    return data;
  }

  public async verifyToken({ token }: RequestGoogleToken): Promise<VerifyTokenResponse | null> {
    const res = await axios
      .get<VerifyTokenResponse>('https://www.googleapis.com/oauth2/v1/tokeninfo', { params: { access_token: token } })
      .catch(() => {
        return null;
      });

    if (res && res.data) return res.data;

    return null;
  }

  async createFile({ json, options, token }: ICreateFile): Promise<FilesResponse> {
    const { body, boundary } = this.prepareData(json, options);

    const { data } = await axios.post<FilesResponse>(this.baseUploadUrl, body, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
    });

    if (typeof data?.id !== 'string' || !data.id.trim()) throw new Error('Google Drive did not confirm a file identifier');
    return data;
  }

  async deleteFile({ id, token }: GoogleFileId) {
    if (!id?.trim()) throw new Error('Google Drive file identifier is required');
    await axios.delete(`${this.baseURL}/files/${encodeURIComponent(id)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...this.config.headers,
      },
    });
  }
}
