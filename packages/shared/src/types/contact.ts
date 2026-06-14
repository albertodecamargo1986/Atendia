export interface Contact {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  email: string;
  profilePicUrl?: string;
  isGroup: boolean;
  lid?: string;
  createdAt: Date;
  updatedAt: Date;
}
