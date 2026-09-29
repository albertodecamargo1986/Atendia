/**
 * Verifica se a contagem atual já atingiu o limite do plano.
 * Convenção: limite -1 (ou qualquer negativo) = ilimitado.
 */
export function isOverLimit(count: number, limit: number | null | undefined): boolean {
  if (limit === null || limit === undefined) return false;
  if (limit < 0) return false;
  return count >= limit;
}
