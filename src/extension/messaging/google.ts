import type { FilesResponse, GoogleAuthTypes, ICreateFile, IGetFilesResponse, VerifyTokenResponse } from '@/interfaces';
import type { KeyringPair$Json } from '@subwallet/keyring/types';
import { sendMessage } from '@/extension/messaging/index';

export function verifyToken(token: string): Promise<VerifyTokenResponse | null> {
  return sendMessage('pri(google.verify.token)', { token });
}

export function initGoogleAuth(type: GoogleAuthTypes['type'] = 'main', wallet?: string): Promise<void> {
  return sendMessage('pri(google.auth)', { type, wallet });
}

export function getGoogleFiles(token: string): Promise<IGetFilesResponse> {
  return sendMessage('pri(google.get.files)', { token });
}

export function getGoogleFile(id: string, token: string): Promise<KeyringPair$Json> {
  return sendMessage('pri(google.get.file)', { id, token });
}

export function createGoogleFile({ json, options, token }: ICreateFile): Promise<FilesResponse> {
  return sendMessage('pri(google.create.file)', { json, options, token });
}

// сейчас не испольузется
export function deleteGoogleFile(id: string, token: string): Promise<void> {
  return sendMessage('pri(google.delete.file)', { id, token });
}
