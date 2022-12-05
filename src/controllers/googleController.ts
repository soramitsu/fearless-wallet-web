import axios from 'axios';
import fetchAdapter from '@vespaiach/axios-fetch-adapter';
import type { KeyringPair$Json } from '@polkadot/keyring/types';
import { CreateFileProp, IGetFilesResponse, VerifyTokenResponse } from '@/interfaces/google';

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

  public authExtension() {
    chrome.identity.launchWebAuthFlow({ url: this.authURL('extension'), interactive: true }, (url) => {
      const params: any = new Proxy(new URLSearchParams(url), {
        get: (searchParams, prop) => searchParams.get(prop as string),
      });
      const urlToOpen = `${chrome.runtime.getURL('popup.html')}#/google/${params.access_token}`;

      chrome.tabs.create({ url: urlToOpen });
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

  async createFile({ json, options }: CreateFileProp, token?: string) {
    const data = this.prepareData(json, options);
    const length = data.length;

    return axios.post(this.baseUploadUrl, data, {
      adapter: fetchAdapter,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/related; boundary=foo_bar_baz',
        'Content-Length': length.toString(),
      },
    });
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
