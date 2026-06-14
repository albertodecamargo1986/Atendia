export interface Queue {
  id: string;
  tenantId: string;
  name: string;
  color: string;
  greetingMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}
