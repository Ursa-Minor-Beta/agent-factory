import { UserModel, UserDocument } from '../models/UserModel.js';
import type { IUserRepository, UserQueryOptions, UserQueryResult } from '../../../../domain/interfaces/repositories/IUserRepository.js';
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

  async findAll(options?: UserQueryOptions): Promise<UserQueryResult> {
    const query: Record<string, unknown> = {};

    if (options?.email) {
      query.email = { $regex: options.email, $options: 'i' };
    }
    if (options?.name) {
      query.name = { $regex: options.name, $options: 'i' };
    }

    const sortField = options?.sortBy ?? 'createdAt';
    const sortOrder = options?.sortOrder === 'asc' ? 1 : -1;

    const [docs, total] = await Promise.all([
      UserModel.find(query)
        .sort({ [sortField]: sortOrder })
        .skip(options?.skip ?? 0)
        .limit(options?.limit ?? 50),
      UserModel.countDocuments(query),
    ]);

    return {
      users: docs.map((doc) => this.toEntity(doc)),
      total,
    };
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
