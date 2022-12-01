interface IGDriveFile {
  id: string;
  address: string;
  name: string;
}

interface FilesResponse {
  id: string;
  name: string;
  description: string;
}

interface IGetFilesResponse {
  files: FilesResponse[];
  incompleteSearch: boolean;
  kind: 'drive#fileList';
}

interface CreateFileProp {
  json: string;
  options: {
    name: string;
    address: string;
  };
}

export interface ICreateFile {
  json: string;
  options: { name: string; address: string };
  token: string;
}

export interface IGetFileMetaResponse {
  description: string;
}

interface VerifyTokenResponse {
  issued_to: string;
  audience: string;
  scope: string;
  expires_in: number;
  access_type: 'online' | 'offline';
}

export { IGetFilesResponse, VerifyTokenResponse, IGDriveFile, CreateFileProp };
