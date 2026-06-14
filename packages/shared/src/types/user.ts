export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: 'OWNER' | 'ADMIN' | 'SUPERVISOR' | 'OPERATOR';
  avatarUrl?: string;
  isActive: boolean;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}
