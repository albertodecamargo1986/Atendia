import { passwordProblems, passwordScore } from '../../lib/password';

const LABELS = ['', 'Fraca', 'Média', 'Boa', 'Forte'];
const COLORS = ['', 'bg-[var(--color-error)]', 'bg-[var(--color-warning)]', 'bg-[var(--color-info)]', 'bg-[var(--color-success)]'];

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const score = passwordScore(password);
  const problems = passwordProblems(password);
  return (
    <div className="space-y-1" aria-live="polite">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= score ? COLORS[score] : 'bg-[var(--surface-tertiary)]'}`} />
        ))}
      </div>
      <p className="text-xs text-[var(--text-secondary)]">
        Força da senha: <strong>{LABELS[score]}</strong>
        {problems.length > 0 && <> — a senha precisa {problems.join(', ')}.</>}
      </p>
    </div>
  );
}
