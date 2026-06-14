export interface QuickReply {
  id: string;
  tenantId: string;
  shortcode: string;
  content: string;
  category?: string;
  createdAt: Date;
  updatedAt: Date;
}
