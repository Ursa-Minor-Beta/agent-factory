export interface File {
  id: string;
  userId: string;
  name: string;
  mimeType: string;
  data: string; // base64
  createdAt: Date;
}

export interface FileListItem {
  id: string;
  name: string;
  mimeType: string;
  createdAt: Date;
}

export interface CreateFileDTO {
  userId: string;
  name: string;
  mimeType: string;
  data: string;
}
