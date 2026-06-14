export type { TicketRating } from './ticket.js';

export interface RatingSummary {
  averageScore: number;
  totalRatings: number;
  scoreDistribution: Record<number, number>;
}
