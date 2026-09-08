import { UserModel, UserDocument } from '../models/UserModel.js';
import type { IUserRepository } from '../../../../domain/interfaces/repositories/IUserRepository.js';
import type { User, CreateUserDTO, UpdateUserDTO } from '../../../../domain/entities/User.js';

export class MongoUserRepository implements IUserRepository {
  private toEntity(doc: UserDocument): User {
    return {
      id: doc._id.toString(),
      email: doc.email,
      passwordHash: doc.passwordHash,
      name: doc.name,
      role: doc.role,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async findById(id: string): Promise<User | null> {
    const doc = await UserModel.findById(id);
    return doc ? this.toEntity(doc) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const doc = await UserModel.findOne({ email: email.toLowerCase() });
    return doc ? this.toEntity(doc) : null;
  }

  async create(data: CreateUserDTO & { passwordHash: string }): Promise<User> {
    const doc = await UserModel.create({
      email: data.email.toLowerCase(),
      passwordHash: data.passwordHash,
      name: data.name,
      role: data.role ?? 'user',
    });
    return this.toEntity(doc);
  }

  async update(id: string, data: UpdateUserDTO): Promise<User | null> {
    const doc = await UserModel.findByIdAndUpdate(id, { $set: data }, { new: true });
    return doc ? this.toEntity(doc) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await UserModel.findByIdAndDelete(id);
    return result !== null;
  }

  async count(): Promise<number> {
    return UserModel.countDocuments();
  }
}
