/** Regras de senha do cadastro: mínimo 8 caracteres, com letra e número. */
export function passwordProblems(pw: string): string[] {
  const problems: string[] = [];
  if (pw.length < 8) problems.push('ter pelo menos 8 caracteres');
  if (!/[A-Za-zÀ-ÿ]/.test(pw)) problems.push('ter pelo menos uma letra');
  if (!/[0-9]/.test(pw)) problems.push('ter pelo menos um número');
  return problems;
}

/** 0 = vazia, 1 = fraca, 2 = média, 3 = boa, 4 = forte */
export function passwordScore(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Za-z]/.test(pw) && /[0-9]/.test(pw)) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12) score++;
  if (passwordProblems(pw).length > 0) return Math.min(score, 1);
  return Math.max(score, 2);
}

/** Gera um identificador (slug) a partir do nome da empresa, com sufixo aleatório para evitar repetição. */
export function slugFromName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 14) || 'empresa';
  const suffix = Math.random().toString(36).slice(2, 6).padEnd(4, '0');
  return `${base.replace(/-$/, '')}-${suffix}`;
}
