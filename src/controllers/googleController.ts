import axios from 'axios';
import fetchAdapter from '@vespaiach/axios-fetch-adapter';
import type { KeyringPair$Json } from '@polkadot/keyring/types';
import type { FilesResponse, ICreateFile, IGetFilesResponse, VerifyTokenResponse } from '@/interfaces';
import { createGoogleFile } from '@/extension/messaging';

class GoogleManage {
  private readonly baseURL = 'https://www.googleapis.com/drive/v3';
  private readonly baseUploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  private readonly extensionRedirectURL = 'https://nhlnehondigmgckngjomcpcefcdplmgc.chromiumapp.org/welcome';
  private readonly baseAuthParams = {
    client_id: chrome.runtime.getManifest().oauth2!.client_id,
    response_type: 'token',
    state: 'pass-through value',
    access_type: 'online',
    prompt: 'consent',
    scope: 'https://www.googleapis.com/auth/drive.appdata',
  };

  urlTypes = {
    main: 'google',
    export: 'main/wallet',
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

  private authURL(type: 'desktop' | 'extension') {
    const prepUrl = new URL(`https://accounts.google.com/o/oauth2/v2/auth`);
    const params: Record<string, string> = {
      ...this.baseAuthParams,
      redirect_uri: type === 'extension' ? this.extensionRedirectURL : `http://localhost:5500/${type}`,
    };

    Object.keys(params).forEach((key) => {
      prepUrl.searchParams.set(key, params[key]);
    });

    return prepUrl.href;
  }

  private prepareData(json: string, { name, address }: { name: string; address: string }) {
    return `--foo_bar_baz
Content-Type: application/json; charset=UTF-8

{
name: "${name}.json",
mimeType: "application/json",
description: "${address}",
parents: ["appDataFolder"]
}

--foo_bar_baz
Content-Type: application/json

${json}
--foo_bar_baz--`;
  }

  public async saveSubstrateAndEthereumWallet(
    json: string,
    ethJson: string,
    name: string,
    address: string,
    ethAddress: string,
    token: string
  ) {
    const ethRes = await createGoogleFile({
      json: JSON.stringify(ethJson),
      options: { name, address: ethAddress },
      token,
    });

    const res = await createGoogleFile({
      json: JSON.stringify(json),
      options: { name, address: `${address}/${ethRes.id}` },
      token,
    });

    return res.id;
  }

  public async authExtension(type: 'main' | 'export' = 'main', wallet?: string) {
    await chrome.identity.launchWebAuthFlow({ url: this.authURL('extension'), interactive: true }, async (url) => {
      const params: any = new Proxy(new URLSearchParams(url), {
        get: (searchParams, prop) => searchParams.get(prop as string),
      });
      const baseURL = `${chrome.runtime.getURL('popup.html')}#/${this.urlTypes[type]}/${params.access_token}`;

      const [tab] = await chrome.tabs.query({ title: 'fearless-wallet' });

      if (tab && tab.id) {
        type === 'export' && wallet
          ? chrome.tabs.update(tab.id, { active: true, url: `${baseURL}?wallet=${wallet}` })
          : chrome.tabs.update(tab.id, { active: true, url: baseURL });

        return true;
      }

      chrome.tabs.create({ url: baseURL });
    });
  }

  public authDesktop() {
    window.open(this.authURL('desktop'));
  }

  public async getFiles(token?: string): Promise<IGetFilesResponse> {
    const { data } = await axios.get<IGetFilesResponse>(
      `${this.baseURL}/files?fields=files(id,name,description)&spaces=appDataFolder`,
      {
        adapter: fetchAdapter,
        headers: {
          Authorization: `Bearer ${token}`,
          ...this.config.headers,
        },
      }
    );

    return data;
  }

  public async getFile(id: string, token?: string | undefined): Promise<KeyringPair$Json> {
    const { data } = await axios.get<KeyringPair$Json>(`${this.baseURL}/files/${id}?alt=media`, {
      adapter: fetchAdapter,
      headers: {
        Authorization: `Bearer ${token}`,
        ...this.config.headers,
      },
    });

    return data;
  }

  public async verifyToken(token: string): Promise<VerifyTokenResponse> {
    const { data } = await axios.get<VerifyTokenResponse>(
      `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`,
      {
        adapter: fetchAdapter,
      }
    );

    return data;
  }

  async createFile({ json, options, token }: ICreateFile): Promise<FilesResponse> {
    const prepData = this.prepareData(json, options);
    const length = prepData.length;

    const { data } = await axios.post<FilesResponse>(this.baseUploadUrl, prepData, {
      adapter: fetchAdapter,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/related; boundary=foo_bar_baz',
        'Content-Length': length.toString(),
      },
    });

    return data;
  }

  async deleteFile(id: string, token: string) {
    axios.delete(this.baseURL, {
      adapter: fetchAdapter,
      params: {
        fields: id,
      },
      headers: {
        Authorization: `Bearer ${token}`,
        ...this.config.headers,
      },
    });
  }
}

export const googleManage = new GoogleManage();
