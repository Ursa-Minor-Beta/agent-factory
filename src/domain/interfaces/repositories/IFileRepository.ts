import type { File, CreateFileDTO } from '../../entities/File.js';

export interface IFileRepository {
  findById(id: string): Promise<File | null>;
  findByIds(ids: string[]): Promise<File[]>;
  findByUserId(userId: string, options?: { limit?: number; offset?: number }): Promise<File[]>;
  create(data: CreateFileDTO): Promise<File>;
  createMany(data: CreateFileDTO[]): Promise<File[]>;
  delete(id: string): Promise<boolean>;
  deleteByUserId(userId: string): Promise<number>;
}
