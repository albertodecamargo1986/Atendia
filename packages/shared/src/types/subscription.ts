export interface Subscription {
  id: string;
  tenantId: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  mercadopagoId?: string;
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'TRIALING';
  currentPeriodEnd?: Date;
  createdAt: Date;
  updatedAt: Date;
}
