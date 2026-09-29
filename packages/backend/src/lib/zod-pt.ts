import { z, ZodIssueCode } from 'zod';

/**
 * Mensagens padrão do zod em português. Schemas que já definem mensagem própria
 * continuam usando a deles; isto só cobre as mensagens genéricas ("Required",
 * "Invalid email", "Expected number, received nan"...).
 */
const tipos: Record<string, string> = {
  string: 'texto',
  number: 'número',
  nan: 'número inválido',
  integer: 'número inteiro',
  boolean: 'verdadeiro/falso',
  date: 'data',
  array: 'lista',
  object: 'objeto',
  undefined: 'vazio',
  null: 'vazio',
};
const tipo = (t: string) => tipos[t] ?? t;

const errorMapPt: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === 'undefined') return { message: 'Campo obrigatório' };
      return { message: `Valor inválido: esperado ${tipo(issue.expected)}, recebido ${tipo(issue.received)}` };
    case ZodIssueCode.invalid_string:
      if (issue.validation === 'email') return { message: 'E-mail inválido' };
      if (issue.validation === 'url') return { message: 'Endereço (URL) inválido' };
      if (issue.validation === 'uuid') return { message: 'Identificador inválido' };
      return { message: 'Texto em formato inválido' };
    case ZodIssueCode.too_small:
      if (issue.type === 'string') return { message: `Deve ter no mínimo ${issue.minimum} caractere(s)` };
      if (issue.type === 'array') return { message: `Deve ter no mínimo ${issue.minimum} item(ns)` };
      return { message: `Deve ser no mínimo ${issue.minimum}` };
    case ZodIssueCode.too_big:
      if (issue.type === 'string') return { message: `Deve ter no máximo ${issue.maximum} caractere(s)` };
      if (issue.type === 'array') return { message: `Deve ter no máximo ${issue.maximum} item(ns)` };
      return { message: `Deve ser no máximo ${issue.maximum}` };
    case ZodIssueCode.invalid_enum_value:
      return { message: `Opção inválida. Use: ${issue.options.join(', ')}` };
    case ZodIssueCode.invalid_date:
      return { message: 'Data inválida' };
    case ZodIssueCode.unrecognized_keys:
      return { message: `Campo(s) não permitido(s): ${issue.keys.join(', ')}` };
    default:
      return { message: ctx.defaultError };
  }
};

z.setErrorMap(errorMapPt);
