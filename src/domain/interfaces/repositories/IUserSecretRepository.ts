import type {
  UserSecret,
  CreateUserSecretDTO,
  UpdateUserSecretDTO,
} from '../../entities/UserSecret.js';

export interface IUserSecretRepository {
  findById(id: string): Promise<UserSecret | null>;
  findByUserId(userId: string): Promise<UserSecret[]>;
  findByName(userId: string, name: string): Promise<UserSecret | null>;
  create(data: CreateUserSecretDTO): Promise<UserSecret>;
  update(id: string, data: UpdateUserSecretDTO): Promise<UserSecret | null>;
  delete(id: string): Promise<boolean>;
}
