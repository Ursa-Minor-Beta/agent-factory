export interface UserSecret {
  id: string;
  userId: string;
  name: string;
  value: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserSecretDTO {
  userId: string;
  name: string;
  value: string;
  description?: string;
}

export interface UpdateUserSecretDTO {
  name?: string;
  value?: string;
  description?: string;
}
