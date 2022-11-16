import axios from 'axios';
import { Http } from './fetchController';

interface GetAccessTokenResponse {
  token: string;
}
class GoogleAuth {
  clientId = '589053005136-cs5d7r49m1siruulv58nq4ihnkvi6ug1.apps.googleusercontent.com';
  private readonly authScope = 'https://www.googleapis.com/auth/drive.appdata';
  redirectURI = 'http://localhost:8080';
  token: string | null = null;
  apiKey = '';
  readonly gDriveApiURL = 'https://www.googleapis.com/drive/v3/files';
  http = Http.create();
  async getAuthToken() {
    const prepUrl = `https://accounts.google.com/o/oauth2/v2/auth`;
    const res = await this.http.get(prepUrl, {
      params: {
        clientId: this.clientId,
        redirect_uri: this.redirectURI,
        response_type: 'token',
        include_granted_scopes: 'true',
        state: 'pass-through value',
        scope: this.authScope,
      },
      headers: {
        'Content-type': 'application/json',
      },
    });

    console.log(res);
  }
  refreshToken() {
    //
  }
  getFiles() {
    if (!this.token) this.refreshToken();

    this.http.get(this.gDriveApiURL, {
      params: {
        spaces: 'appDataFolder',
        key: this.apiKey,
      },
      headers: {
        Autorization: `Bearer ${this.token}`,
        Accept: 'application/json',
      },
    });
  }

  getFile(id: string) {
    //
  }

  createFile() {
    this.http.post(this.gDriveApiURL, '', {
      params: {
        spaces: 'appDataFolder',
        key: this.apiKey,
      },
      headers: {
        Autorization: `Bearer ${this.token}`,
        Accept: 'application/json',
      },
    });
  }

  deleteFile(id: string) {
    //
  }
}

export const googleAuth = new GoogleAuth();
