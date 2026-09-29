import axios from 'axios';

/**
 * Extrai uma mensagem de erro legível de qualquer erro (axios, Error, string...).
 *
 * O backend devolve erros no formato `{ error: { code, message } }`, mas algumas
 * rotas antigas ainda devolvem `{ error: 'mensagem' }` ou `{ message: '...' }`.
 * Esta função cobre todos os casos e NUNCA devolve "[object Object]".
 */
export function getErrorMessage(err: unknown, fallback = 'Algo deu errado. Tente novamente.'): string {
  if (!err) return fallback;

  if (typeof err === 'string') return err;

  if (axios.isAxiosError(err)) {
    const data: any = err.response?.data;

    if (data) {
      if (typeof data === 'string' && data.trim() && !data.trim().startsWith('<')) return data;
      const e = data.error;
      if (typeof e === 'string' && e.trim()) return e;
      if (e && typeof e === 'object' && typeof e.message === 'string' && e.message.trim()) return e.message;
      if (typeof data.message === 'string' && data.message.trim()) return data.message;
    }

    if (!err.response) {
      return 'Não foi possível falar com o servidor. Verifique sua internet e tente novamente.';
    }

    switch (err.response.status) {
      case 401: return 'Sua sessão expirou. Entre novamente.';
      case 403: return 'Você não tem permissão para fazer isso.';
      case 404: return 'Não encontrado.';
      case 413: return 'Arquivo muito grande.';
      case 429: return 'Muitas tentativas. Aguarde um pouco e tente de novo.';
      default:
        if (err.response.status >= 500) return 'O servidor teve um problema. Tente novamente em instantes.';
    }
    return fallback;
  }

  if (err instanceof Error && err.message) return err.message;

  if (typeof err === 'object') {
    const anyErr = err as any;
    if (typeof anyErr.message === 'string' && anyErr.message) return anyErr.message;
    if (anyErr.error) return getErrorMessage(anyErr.error, fallback);
  }

  return fallback;
}

/** Código de erro do backend (ex.: 'VALIDATION_ERROR'), se houver. */
export function getErrorCode(err: unknown): string | undefined {
  if (axios.isAxiosError(err)) {
    const e: any = (err.response?.data as any)?.error;
    if (e && typeof e === 'object' && typeof e.code === 'string') return e.code;
  }
  return undefined;
}

/** Status HTTP do erro, se houver. */
export function getErrorStatus(err: unknown): number | undefined {
  if (axios.isAxiosError(err)) return err.response?.status;
  return undefined;
}
