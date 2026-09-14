import type { File, CreateFileDTO, FileListItem } from '../../entities/File.js';

export interface FileQueryOptions {
  limit?: number;
  offset?: number;
  fields?: Array<keyof File>;
}

export interface IFileRepository {
  findById(id: string): Promise<File | null>;
  findByIds(ids: string[]): Promise<File[]>;
  findByUserId(userId: string, options?: FileQueryOptions): Promise<File[]>;
  listByUserId(userId: string, options?: { limit?: number; offset?: number }): Promise<FileListItem[]>;
  create(data: CreateFileDTO): Promise<File>;
  createMany(data: CreateFileDTO[]): Promise<File[]>;
  delete(id: string): Promise<boolean>;
  deleteByUserId(userId: string): Promise<number>;
}
