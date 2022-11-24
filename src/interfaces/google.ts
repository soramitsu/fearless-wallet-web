interface IGDriveFile {
  id: string;
  kind: string;
  mimeType: string;
  name: string;
}

interface IGetFilesResponse {
  files: IGDriveFile[];
  incompleteSearch: false;
  kind: 'drive#fileList';
}

interface CreateFileProp {
  json: string;
  name: string;
}
export { IGetFilesResponse, IGDriveFile, CreateFileProp };
