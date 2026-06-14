export interface Webhook {
  id: string;
  tenantId: string;
  url: string;
  events: string[];
  secret: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
  statusCode?: number;
  response?: string;
  success: boolean;
  attempts: number;
  createdAt: Date;
}
