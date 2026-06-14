"use client";

import { useState, FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import {
  Bot,
  ArrowLeft,
  CreditCard,
  QrCode,
  Check,
  Loader2,
  Shield,
  Lock,
  ExternalLink,
} from "lucide-react";

const plans: Record<string, { name: string; priceMonth: number; total: number; period: string }> = {
  mensal: { name: "Mensal", priceMonth: 147, total: 147, period: "1 mes" },
  trimestral: { name: "Trimestral", priceMonth: 127, total: 381, period: "3 meses" },
  semestral: { name: "Semestral", priceMonth: 107, total: 642, period: "6 meses" },
  anual: { name: "Anual", priceMonth: 87, total: 1044, period: "12 meses" },
};

function formatCPF(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8)
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12)
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 7)
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

type PaymentMethod = "mercadopago" | "stripe";

type CheckoutStep = "form" | "redirect" | "success";

function CheckoutForm() {
  const searchParams = useSearchParams();
  const planId = searchParams.get("plan") || "trimestral";
  const plan = plans[planId] || plans.trimestral;
  const statusParam = searchParams.get("status");

  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    cpfCnpj: "",
    telefone: "",
    paymentMethod: "mercadopago" as PaymentMethod,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<CheckoutStep>(statusParam === "failure" ? "form" : "form");
  const [serial, setSerial] = useState("");
  const [mpUrl, setMpUrl] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          plan: planId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erro ao processar o pedido. Tente novamente.");
        return;
      }

      // If Mercado Pago returned a redirect URL
      const checkoutUrl = data.sandboxInitPoint || data.initPoint;
      if (checkoutUrl && formData.paymentMethod === "mercadopago") {
        setMpUrl(checkoutUrl);
        setSerial(data.serial);
        setStep("redirect");
        return;
      }

      // Direct success (free plan or manual)
      setSerial(data.serial);
      setStep("success");
    } catch {
      setError("Erro de conexao. Verifique sua internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  if (step === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-50 px-4">
        <div className="w-full max-w-lg rounded-2xl border border-dark-200 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-accent-50">
            <Check className="h-8 w-8 text-accent-500" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-dark-900">
            Compra Realizada com Sucesso!
          </h1>
          <p className="mb-6 text-dark-500">
            Seu serial foi gerado e enviado para <strong>{formData.email}</strong>
          </p>

          <div className="mb-6 rounded-xl border-2 border-dashed border-primary-200 bg-primary-50 p-6">
            <p className="mb-1 text-sm font-medium text-primary-600">
              Sua Chave Serial
            </p>
            <p className="text-2xl font-bold tracking-wider text-primary-700 font-mono">
              {serial}
            </p>
          </div>

          <div className="mb-6 space-y-3 text-left rounded-xl bg-dark-50 p-4">
            <p className="text-sm font-semibold text-dark-900">Proximos passos:</p>
            <ol className="list-inside list-decimal space-y-2 text-sm text-dark-600">
              <li>Baixe o instalador do AtendIA (link no email)</li>
              <li>Instale o aplicativo no seu computador</li>
              <li>Abra o AtendIA e insira o serial acima</li>
              <li>Conecte seu WhatsApp e comece a atender!</li>
            </ol>
          </div>

          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para a pagina inicial
          </Link>
        </div>
      </div>
    );
  }

  if (step === "redirect") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-50 px-4">
        <div className="w-full max-w-lg rounded-2xl border border-dark-200 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary-50">
            <QrCode className="h-8 w-8 text-primary-500" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-dark-900">
            Finalize o Pagamento
          </h1>
          <p className="mb-6 text-dark-500">
            Voce sera redirecionado para o Mercado Pago para concluir o pagamento.
            Apos a aprovacao, seu serial sera ativado automaticamente.
          </p>

          <div className="mb-6 rounded-xl border-2 border-dashed border-primary-200 bg-primary-50 p-6">
            <p className="mb-1 text-sm font-medium text-primary-600">
              Seu Serial (sera ativado apos pagamento)
            </p>
            <p className="text-2xl font-bold tracking-wider text-primary-700 font-mono">
              {serial}
            </p>
          </div>

          <a
            href={mpUrl}
            className="btn-primary inline-flex items-center gap-2"
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="h-5 w-5" />
            Ir para Mercado Pago
          </a>

          <p className="mt-4 text-xs text-dark-400">
            Apos o pagamento, voce recebera o serial ativado por email.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-50 py-12 px-4">
      <div className="container-custom max-w-4xl mx-auto">
        <div className="mb-8">
          <Link
            href="/#precos"
            className="inline-flex items-center gap-2 text-sm font-medium text-dark-500 hover:text-dark-900 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar aos planos
          </Link>
        </div>

        <div className="grid gap-8 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <div className="rounded-2xl border border-dark-200 bg-white p-6 shadow-sm sm:p-8">
              <h1 className="mb-1 text-2xl font-bold text-dark-900">
                Finalizar Compra
              </h1>
              <p className="mb-8 text-dark-500">
                Preencha seus dados para adquirir o AtendIA
              </p>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="nome" className="label-field">
                    Nome Completo
                  </label>
                  <input
                    id="nome"
                    type="text"
                    required
                    className="input-field"
                    placeholder="Seu nome completo"
                    value={formData.nome}
                    onChange={(e) =>
                      setFormData({ ...formData, nome: e.target.value })
                    }
                  />
                </div>

                <div>
                  <label htmlFor="email" className="label-field">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    className="input-field"
                    placeholder="seu@email.com"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                  />
                </div>

                <div>
                  <label htmlFor="cpfCnpj" className="label-field">
                    CPF / CNPJ
                  </label>
                  <input
                    id="cpfCnpj"
                    type="text"
                    required
                    className="input-field"
                    placeholder="000.000.000-00"
                    value={formData.cpfCnpj}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        cpfCnpj: formatCPF(e.target.value),
                      })
                    }
                  />
                </div>

                <div>
                  <label htmlFor="telefone" className="label-field">
                    Telefone
                  </label>
                  <input
                    id="telefone"
                    type="tel"
                    required
                    className="input-field"
                    placeholder="(11) 99999-9999"
                    value={formData.telefone}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        telefone: formatPhone(e.target.value),
                      })
                    }
                  />
                </div>

                <div>
                  <label className="label-field">Metodo de Pagamento</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({ ...formData, paymentMethod: "mercadopago" })
                      }
                      className={`flex items-center justify-center gap-2 rounded-xl border-2 p-4 transition-all ${
                        formData.paymentMethod === "mercadopago"
                          ? "border-primary-500 bg-primary-50 text-primary-700"
                          : "border-dark-200 text-dark-500 hover:border-dark-300"
                      }`}
                    >
                      <QrCode className="h-5 w-5" />
                      <div className="text-left">
                        <p className="text-sm font-semibold">Mercado Pago</p>
                        <p className="text-xs opacity-75">PIX, Boleto, Cartao</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({ ...formData, paymentMethod: "stripe" })
                      }
                      className={`flex items-center justify-center gap-2 rounded-xl border-2 p-4 transition-all ${
                        formData.paymentMethod === "stripe"
                          ? "border-primary-500 bg-primary-50 text-primary-700"
                          : "border-dark-200 text-dark-500 hover:border-dark-300"
                      }`}
                    >
                      <CreditCard className="h-5 w-5" />
                      <div className="text-left">
                        <p className="text-sm font-semibold">Stripe</p>
                        <p className="text-xs opacity-75">Cartao Internacional</p>
                      </div>
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <Lock className="mr-2 h-5 w-5" />
                      Finalizar Compra — R${plan.total}
                    </>
                  )}
                </button>

                <div className="flex items-center justify-center gap-2 pt-2 text-xs text-dark-400">
                  <Shield className="h-4 w-4 text-accent-500" />
                  Pagamento 100% seguro e criptografado
                </div>
              </form>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="sticky top-24 rounded-2xl border border-dark-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-dark-900">
                Resumo do Pedido
              </h2>

              <div className="mb-4 flex items-center gap-3 rounded-xl bg-primary-50 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-600">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-dark-900">
                    AtendIA — {plan.name}
                  </p>
                  <p className="text-sm text-dark-500">{plan.period}</p>
                </div>
              </div>

              <div className="space-y-3 border-b border-dark-100 pb-4 text-sm">
                <div className="flex justify-between text-dark-600">
                  <span>Valor mensal</span>
                  <span>R${plan.priceMonth}/mes</span>
                </div>
                <div className="flex justify-between text-dark-600">
                  <span>Periodo</span>
                  <span>{plan.period}</span>
                </div>
              </div>

              <div className="flex justify-between pt-4 text-lg font-bold text-dark-900">
                <span>Total</span>
                <span>R${plan.total}</span>
              </div>

              <div className="mt-6 space-y-3">
                <div className="flex items-start gap-2 text-sm text-dark-500">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent-500" />
                  <span>Licenca valida por {plan.period}</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-dark-500">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent-500" />
                  <span>Serial enviado por email apos pagamento</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-dark-500">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent-500" />
                  <span>Ativacao imediata apos aprovacao</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-dark-500">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent-500" />
                  <span>Suporte tecnico incluso</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        </div>
      }
    >
      <CheckoutForm />
    </Suspense>
  );
}
