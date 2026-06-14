export interface InternalMessage {
  id: string;
  tenantId: string;
  senderId: string;
  receiverId?: string;
  groupId?: string;
  content: string;
  readAt?: Date;
  createdAt: Date;
}
