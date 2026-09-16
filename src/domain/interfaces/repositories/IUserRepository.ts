import { User, CreateUserDTO, UpdateUserDTO } from '../../entities/User.js';

export interface UserQueryOptions {
  email?: string;
  name?: string;
  skip?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'email' | 'name';
  sortOrder?: 'asc' | 'desc';
}

export interface UserQueryResult {
  users: User[];
  total: number;
}

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findAll(options?: UserQueryOptions): Promise<UserQueryResult>;
  create(data: CreateUserDTO & { passwordHash: string }): Promise<User>;
  update(id: string, data: UpdateUserDTO): Promise<User | null>;
  delete(id: string): Promise<boolean>;
  count(): Promise<number>;
}
