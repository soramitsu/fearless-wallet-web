import { Http } from './fetchController';
import { CreateFileProp, IGDriveFile, IGetFilesResponse } from '@/interfaces/google';

class GoogleAuth {
  http = Http.create();
  private readonly baseURL = 'https://www.googleapis.com/drive/v3';
  private readonly baseUploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  private readonly extensionRedirectURL = 'https://mkikoojmkahfncdffoledbigmfhmllao.chromiumapp.org/welcome';
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

  private prepareData(json: string, name: string) {
    return `--foo_bar_baz
    Content-Type: application/json; charset=UTF-8

    {
      name: "${name}.json",
      mimeType: "application/json",
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

  public async getFiles(token?: string) {
    return this.http.get<IGetFilesResponse>(`${this.baseURL}/files`, {
      params: this.config.params,
      headers: {
        Authorization: `Bearer ${token}`,
        ...this.config.headers,
      },
    });
  }

  public async getFile(id: string, token?: string | undefined) {
    return this.http.get<IGDriveFile>(`${this.baseURL}/files/${id}`, {
      params: {
        alt: 'media',
      },
      headers: {
        Authorization: `Bearer ${token}`,
        ...this.config.headers,
      },
    });
  }

  public async verifyToken(token: string) {
    console.log(token);

    return this.http.get<string>(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`);
  }

  async createFile({ json, name }: CreateFileProp, token?: string) {
    const data = this.prepareData(json, name);
    const length = data.length;

    return this.http.post(this.baseUploadUrl, data, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/related; boundary=foo_bar_baz',
        'Content-Length': length.toString(),
      },
    });
  }

  async deleteFile(id: string, token: string) {
    this.http.delete(this.baseURL, {
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

export const googleAuth = new GoogleAuth();
