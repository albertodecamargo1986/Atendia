"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Bot,
  MessageCircle,
  UserCheck,
  Settings,
  Check,
  ChevronDown,
  ChevronUp,
  Menu,
  X,
  Zap,
  Shield,
  Headphones,
  ArrowRight,
  Star,
  Download,
  Key,
  ShoppingCart,
} from "lucide-react";

const plans = [
  {
    id: "mensal",
    name: "Mensal",
    priceMonth: 147,
    discount: 0,
    total: 147,
    period: "1 mes",
    featured: false,
  },
  {
    id: "trimestral",
    name: "Trimestral",
    priceMonth: 127,
    discount: 14,
    total: 381,
    period: "3 meses",
    featured: true,
    badge: "Mais Vendido",
  },
  {
    id: "semestral",
    name: "Semestral",
    priceMonth: 107,
    discount: 27,
    total: 642,
    period: "6 meses",
    featured: false,
  },
  {
    id: "anual",
    name: "Anual",
    priceMonth: 87,
    discount: 41,
    total: 1044,
    period: "12 meses",
    featured: false,
  },
];

const features = [
  {
    icon: Bot,
    title: "Agente de IA 24h",
    description:
      "Atendimento automatico e inteligente 24 horas por dia, 7 dias por semana. Nunca mais perca um cliente por falta de resposta.",
  },
  {
    icon: MessageCircle,
    title: "Integracao WhatsApp",
    description:
      "Conexao direta com seu WhatsApp Business. Seus clientes conversam no canal que ja usam, sem friccao.",
  },
  {
    icon: UserCheck,
    title: "Intervencao Humana",
    description:
      "Transfira a conversa para um atendente humano a qualquer momento. O melhor da IA com o toque humano quando necessario.",
  },
  {
    icon: Settings,
    title: "Configuracao Simples",
    description:
      "Configure em minutos sem conhecimento tecnico. Baixe, instale, ative com seu serial e comece a atender.",
  },
];

const steps = [
  {
    number: "01",
    icon: ShoppingCart,
    title: "Compre o Plano",
    description:
      "Escolha o plano ideal para seu negocio e realize o pagamento via Mercado Pago ou cartao de credito.",
  },
  {
    number: "02",
    icon: Download,
    title: "Download o Instalador",
    description:
      "Apos a confirmacao do pagamento, receba por email o link para baixar o instalador .exe do AtendIA.",
  },
  {
    number: "03",
    icon: Key,
    title: "Ative com o Serial",
    description:
      "Insira sua chave serial no formato ATND-XXXX-XXXX-XXXX-XXXX e comece a usar imediatamente.",
  },
];

const faqs = [
  {
    question: "O AtendIA precisa de internet para funcionar?",
    answer:
      "Sim, o AtendIA requires conexao com a internet para se comunicar com a API de inteligencia artificial e manter a sincronizacao com o WhatsApp. Porem, o aplicativo desktop funciona normalmente em conexoes 4G ou internet basica.",
  },
  {
    question: "Posso transferir minha licenca para outro computador?",
    answer:
      "Sim, voce pode desativar a licenca no computador atual e reativar em outro. Cada serial permite ativacao em 1 computador por vez. Para transferir, basta desativar no app e ativar no novo dispositivo.",
  },
  {
    question: "Quais metodos de pagamento sao aceitos?",
    answer:
      "Aceitamos pagamento via Mercado Pago (PIX, boleto, cartao de credito e debito) e Stripe (cartao de credito internacional). Todas as transacoes sao seguras e criptografadas.",
  },
  {
    question: "O sistema funciona offline?",
    answer:
      "O aplicativo desktop precisa de internet para o agente de IA funcionar, pois as respostas sao geradas na nuvem. Sem conexao, o sistema entra em modo de espera e retoma automaticamente quando a internet volta.",
  },
  {
    question: "Quantos numeros de WhatsApp posso conectar?",
    answer:
      "Cada licenca do AtendIA permite conectar 1 numero de WhatsApp. Caso precise de mais numeros, voce pode adquirir licencas adicionais com desconto especial entrando em contato com nosso suporte.",
  },
  {
    question: "Posso cancelar a qualquer momento?",
    answer:
      "Sim, voce pode cancelar seu plano a qualquer momento. Ao cancelar, voce ainda tera acesso ate o final do periodo ja pago. Nao ha taxas de cancelamento ou multas. Apos o vencimento, o serial sera desativado.",
  },
];

const includedItems = [
  "Agente de IA ilimitado",
  "Integracao WhatsApp",
  "Intervencao humana",
  "Atualizacoes automaticas",
  "Suporte tecnico",
  "Painel de controle",
];

export default function HomePage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <main className="overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-dark-900/80 backdrop-blur-xl">
        <div className="container-custom flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">
              Atend<span className="text-primary-400">IA</span>
            </span>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            <a href="#funcionalidades" className="text-sm text-dark-300 transition-colors hover:text-white">
              Funcionalidades
            </a>
            <a href="#precos" className="text-sm text-dark-300 transition-colors hover:text-white">
              Precos
            </a>
            <a href="#como-funciona" className="text-sm text-dark-300 transition-colors hover:text-white">
              Como Funciona
            </a>
            <a href="#faq" className="text-sm text-dark-300 transition-colors hover:text-white">
              FAQ
            </a>
            <Link href="/checkout?plan=trimestral" className="btn-primary !py-2.5 !px-6 !text-sm">
              Comprar Agora
            </Link>
          </div>

          <button
            className="md:hidden text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="border-t border-white/10 bg-dark-900/95 backdrop-blur-xl md:hidden">
            <div className="flex flex-col gap-4 px-4 py-6">
              <a href="#funcionalidades" className="text-dark-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                Funcionalidades
              </a>
              <a href="#precos" className="text-dark-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                Precos
              </a>
              <a href="#como-funciona" className="text-dark-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                Como Funciona
              </a>
              <a href="#faq" className="text-dark-300 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                FAQ
              </a>
              <Link href="/checkout?plan=trimestral" className="btn-primary !py-2.5 !text-sm text-center">
                Comprar Agora
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center gradient-bg pt-16 overflow-hidden">
        {/* Background decorations */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-primary-500/20 blur-3xl" />
          <div className="absolute top-1/3 -left-20 h-60 w-60 rounded-full bg-accent-500/10 blur-3xl" />
          <div className="absolute bottom-20 right-1/4 h-40 w-40 rounded-full bg-primary-400/10 blur-3xl" />
        </div>

        <div className="container-custom relative px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
            {/* Left: Text */}
            <div className="max-w-2xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary-400/30 bg-primary-500/10 px-4 py-1.5">
                <Zap className="h-4 w-4 text-primary-400" />
                <span className="text-sm font-medium text-primary-300">
                  Novo: Atendimento inteligente com IA
                </span>
              </div>

              <h1 className="mb-6 text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
                Automatize seu atendimento no WhatsApp com{" "}
                <span className="gradient-text">Inteligencia Artificial</span>
              </h1>

              <p className="mb-8 max-w-xl text-lg leading-relaxed text-dark-300 sm:text-xl">
                Agente de IA disponivel 24h por dia, com intervencao humana em
                tempo real. Simples de configurar e pronto para transformar o
                atendimento do seu negocio.
              </p>

              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <Link href="/checkout?plan=trimestral" className="btn-accent group">
                  Comprar Agora
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
                <a href="#funcionalidades" className="btn-secondary !border-white/20 !text-white hover:!bg-white/10">
                  Ver Funcionalidades
                </a>
              </div>

              <div className="mt-10 flex items-center gap-6 text-sm text-dark-400">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-accent-500" />
                  <span>Pagamento seguro</span>
                </div>
                <div className="flex items-center gap-2">
                  <Headphones className="h-4 w-4 text-accent-500" />
                  <span>Suporte dedicado</span>
                </div>
              </div>
            </div>

            {/* Right: Software Mockup */}
            <div className="relative hidden lg:block">
              <div className="relative">
                {/* Glow effect */}
                <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-primary-500/20 to-accent-500/20 blur-2xl" />

                {/* Mockup frame */}
                <div className="relative rounded-2xl border border-white/10 bg-dark-800/90 p-1 shadow-2xl backdrop-blur-sm">
                  {/* Title bar */}
                  <div className="flex items-center gap-2 rounded-t-xl bg-dark-800 px-4 py-3">
                    <div className="h-3 w-3 rounded-full bg-red-500" />
                    <div className="h-3 w-3 rounded-full bg-yellow-500" />
                    <div className="h-3 w-3 rounded-full bg-green-500" />
                    <span className="ml-4 text-sm text-dark-400">AtendIA v1.0</span>
                  </div>

                  {/* App content */}
                  <div className="grid grid-cols-3 gap-0 rounded-b-xl bg-dark-900/50">
                    {/* Sidebar */}
                    <div className="col-span-1 border-r border-white/5 p-4">
                      <div className="mb-4 flex items-center gap-2">
                        <Bot className="h-5 w-5 text-primary-400" />
                        <span className="text-sm font-semibold text-white">AtendIA</span>
                      </div>
                      <div className="space-y-2">
                        <div className="rounded-lg bg-primary-600/20 px-3 py-2 text-xs text-primary-300">
                          Conversas
                        </div>
                        <div className="rounded-lg px-3 py-2 text-xs text-dark-400">
                          Configuracoes
                        </div>
                        <div className="rounded-lg px-3 py-2 text-xs text-dark-400">
                          Relatorios
                        </div>
                        <div className="rounded-lg px-3 py-2 text-xs text-dark-400">
                          Licenca
                        </div>
                      </div>
                      <div className="mt-6 rounded-lg border border-accent-500/20 bg-accent-500/10 p-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-accent-500 animate-pulse-slow" />
                          <span className="text-xs font-medium text-accent-400">IA Ativa</span>
                        </div>
                        <p className="mt-1 text-[10px] text-dark-400">Conectado ao WhatsApp</p>
                      </div>
                    </div>

                    {/* Chat area */}
                    <div className="col-span-2 flex flex-col">
                      <div className="border-b border-white/5 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-accent-500/20 flex items-center justify-center">
                            <MessageCircle className="h-4 w-4 text-accent-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">Cliente WhatsApp</p>
                            <p className="text-[10px] text-accent-400">Online</p>
                          </div>
                        </div>
                      </div>

                      {/* Messages */}
                      <div className="flex-1 space-y-3 p-4">
                        <div className="flex justify-start">
                          <div className="max-w-[80%] rounded-lg rounded-tl-none bg-dark-700 px-3 py-2">
                            <p className="text-xs text-dark-300">Ola, gostaria de saber sobre o produto X</p>
                            <span className="text-[9px] text-dark-500">10:32</span>
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <div className="max-w-[80%] rounded-lg rounded-tr-none bg-primary-600/80 px-3 py-2">
                            <div className="flex items-center gap-1 mb-1">
                              <Bot className="h-3 w-3 text-primary-200" />
                              <span className="text-[9px] text-primary-200">IA</span>
                            </div>
                            <p className="text-xs text-white">Ola! Claro, posso te ajudar. O produto X esta disponivel...</p>
                            <span className="text-[9px] text-primary-200">10:32</span>
                          </div>
                        </div>
                        <div className="flex justify-start">
                          <div className="max-w-[80%] rounded-lg rounded-tl-none bg-dark-700 px-3 py-2">
                            <p className="text-xs text-dark-300">Qual o preco?</p>
                            <span className="text-[9px] text-dark-500">10:33</span>
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <div className="max-w-[80%] rounded-lg rounded-tr-none bg-primary-600/80 px-3 py-2">
                            <div className="flex items-center gap-1 mb-1">
                              <Bot className="h-3 w-3 text-primary-200" />
                              <span className="text-[9px] text-primary-200">IA</span>
                            </div>
                            <p className="text-xs text-white">O preco do produto X e R$ 99,90. Deseja fazer o pedido?</p>
                            <span className="text-[9px] text-primary-200">10:33</span>
                          </div>
                        </div>
                      </div>

                      {/* Input */}
                      <div className="border-t border-white/5 p-3">
                        <div className="flex items-center gap-2 rounded-lg bg-dark-700 px-3 py-2">
                          <span className="text-xs text-dark-500">Digite sua mensagem...</span>
                          <div className="ml-auto flex gap-2">
                            <UserCheck className="h-4 w-4 text-dark-500" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom wave */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 80L60 73.3C120 66.7 240 53.3 360 46.7C480 40 600 40 720 46.7C840 53.3 960 66.7 1080 70C1200 73.3 1320 66.7 1380 63.3L1440 60V80H1380C1320 80 1200 80 1080 80C960 80 840 80 720 80C600 80 480 80 360 80C240 80 120 80 60 80H0Z" fill="white"/>
          </svg>
        </div>
      </section>

      {/* Funcionalidades */}
      <section id="funcionalidades" className="section-padding bg-white">
        <div className="container-custom px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <span className="mb-4 inline-block rounded-full bg-primary-50 px-4 py-1.5 text-sm font-semibold text-primary-600">
              Funcionalidades
            </span>
            <h2 className="mb-4 text-3xl font-extrabold text-dark-900 sm:text-4xl">
              Tudo que voce precisa para{" "}
              <span className="gradient-text">automatizar seu atendimento</span>
            </h2>
            <p className="text-lg text-dark-500">
              Recursos poderosos que combinam inteligencia artificial com
              atendimento humano para oferecer a melhor experiencia ao seu
              cliente.
            </p>
          </div>

          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, index) => (
              <div
                key={index}
                className="card group text-center"
              >
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-primary-50 text-primary-600 transition-colors duration-300 group-hover:bg-primary-600 group-hover:text-white">
                  <feature.icon className="h-7 w-7" />
                </div>
                <h3 className="mb-3 text-lg font-bold text-dark-900">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-dark-500">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Planos e Precos */}
      <section id="precos" className="section-padding bg-dark-50">
        <div className="container-custom px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <span className="mb-4 inline-block rounded-full bg-accent-50 px-4 py-1.5 text-sm font-semibold text-accent-600">
              Planos e Precos
            </span>
            <h2 className="mb-4 text-3xl font-extrabold text-dark-900 sm:text-4xl">
              Escolha o plano ideal para{" "}
              <span className="gradient-text">seu negocio</span>
            </h2>
            <p className="text-lg text-dark-500">
              Quanto maior o plano, maior o desconto. Todos os planos incluem
              todas as funcionalidades.
            </p>
          </div>

          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-2xl border p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
                  plan.featured
                    ? "border-primary-500 bg-white shadow-lg shadow-primary-500/10 ring-2 ring-primary-500"
                    : "border-dark-200 bg-white shadow-sm"
                }`}
              >
                {plan.featured && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary-600 px-4 py-1.5 text-xs font-bold text-white shadow-lg">
                      <Star className="h-3 w-3" />
                      {plan.badge}
                    </span>
                  </div>
                )}

                <div className="text-center">
                  <h3 className="mb-2 text-lg font-bold text-dark-900">
                    {plan.name}
                  </h3>

                  {plan.discount > 0 && (
                    <span className="mb-2 inline-block rounded-full bg-accent-50 px-3 py-0.5 text-xs font-semibold text-accent-600">
                      {plan.discount}% OFF
                    </span>
                  )}

                  <div className="mt-4">
                    <span className="text-4xl font-extrabold text-dark-900">
                      R${plan.priceMonth}
                    </span>
                    <span className="text-dark-500">/mes</span>
                  </div>

                  <p className="mt-2 text-sm text-dark-400">
                    Total: R${plan.total} ({plan.period})
                  </p>

                  <div className="mt-6 space-y-3 text-left">
                    {includedItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Check className="h-4 w-4 flex-shrink-0 text-accent-500" />
                        <span className="text-sm text-dark-600">{item}</span>
                      </div>
                    ))}
                  </div>

                  <Link
                    href={`/checkout?plan=${plan.id}`}
                    className={`mt-8 block w-full rounded-xl py-3 text-center text-sm font-semibold transition-all duration-300 ${
                      plan.featured
                        ? "bg-primary-600 text-white shadow-md shadow-primary-600/25 hover:bg-primary-700"
                        : "border-2 border-primary-600 text-primary-600 hover:bg-primary-50"
                    }`}
                  >
                    Comprar {plan.name}
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-8 text-center text-sm text-dark-400">
            Todos os precos sao em Reais (BRL). Pagamento unico por periodo.
          </p>
        </div>
      </section>

      {/* Como Funciona */}
      <section id="como-funciona" className="section-padding bg-white">
        <div className="container-custom px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <span className="mb-4 inline-block rounded-full bg-primary-50 px-4 py-1.5 text-sm font-semibold text-primary-600">
              Como Funciona
            </span>
            <h2 className="mb-4 text-3xl font-extrabold text-dark-900 sm:text-4xl">
              Comece a usar em{" "}
              <span className="gradient-text">3 passos simples</span>
            </h2>
            <p className="text-lg text-dark-500">
              Do pagamento ao atendimento automatico em poucos minutos.
            </p>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {steps.map((step, index) => (
              <div key={index} className="relative text-center">
                {/* Connector line (desktop) */}
                {index < steps.length - 1 && (
                  <div className="absolute top-14 left-1/2 hidden h-0.5 w-full bg-gradient-to-r from-primary-200 to-accent-200 md:block" />
                )}

                <div className="relative mx-auto mb-6 flex h-28 w-28 items-center justify-center">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary-100 to-accent-100" />
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-md">
                    <step.icon className="h-8 w-8 text-primary-600" />
                  </div>
                  <span className="absolute -top-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-sm font-bold text-white">
                    {step.number}
                  </span>
                </div>

                <h3 className="mb-3 text-xl font-bold text-dark-900">
                  {step.title}
                </h3>
                <p className="mx-auto max-w-xs text-sm leading-relaxed text-dark-500">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="section-padding bg-dark-50">
        <div className="container-custom px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <span className="mb-4 inline-block rounded-full bg-accent-50 px-4 py-1.5 text-sm font-semibold text-accent-600">
              FAQ
            </span>
            <h2 className="mb-4 text-3xl font-extrabold text-dark-900 sm:text-4xl">
              Perguntas <span className="gradient-text">Frequentes</span>
            </h2>
            <p className="text-lg text-dark-500">
              Tire suas duvidas sobre o AtendIA.
            </p>
          </div>

          <div className="mx-auto mt-16 max-w-3xl space-y-4">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="overflow-hidden rounded-xl border border-dark-200 bg-white transition-shadow duration-300 hover:shadow-md"
              >
                <button
                  className="flex w-full items-center justify-between px-6 py-5 text-left"
                  onClick={() =>
                    setOpenFaq(openFaq === index ? null : index)
                  }
                >
                  <span className="pr-4 text-base font-semibold text-dark-900">
                    {faq.question}
                  </span>
                  {openFaq === index ? (
                    <ChevronUp className="h-5 w-5 flex-shrink-0 text-primary-600" />
                  ) : (
                    <ChevronDown className="h-5 w-5 flex-shrink-0 text-dark-400" />
                  )}
                </button>

                <div
                  className={`overflow-hidden transition-all duration-300 ${
                    openFaq === index ? "max-h-96" : "max-h-0"
                  }`}
                >
                  <div className="border-t border-dark-100 px-6 py-5">
                    <p className="text-sm leading-relaxed text-dark-600">
                      {faq.answer}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative overflow-hidden gradient-bg py-20">
        <div className="absolute inset-0">
          <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-primary-500/20 blur-3xl" />
          <div className="absolute bottom-0 left-1/4 h-40 w-40 rounded-full bg-accent-500/10 blur-3xl" />
        </div>

        <div className="container-custom relative px-4 text-center sm:px-6 lg:px-8">
          <h2 className="mx-auto max-w-2xl text-3xl font-extrabold text-white sm:text-4xl">
            Pronto para transformar seu atendimento no WhatsApp?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-dark-300">
            Junte-se a centenas de negocios que ja automatizaram seu
            atendimento com AtendIA.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/checkout?plan=trimestral" className="btn-accent group">
              Comece Agora — Plano Trimestral
              <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
          <p className="mt-6 text-sm text-dark-400">
            14% de desconto no plano trimestral. Comece a economizar hoje.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-dark-200 bg-dark-900 py-12">
        <div className="container-custom px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-8 md:flex-row md:justify-between">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-white">
                Atend<span className="text-primary-400">IA</span>
              </span>
            </div>

            {/* Links */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-dark-400">
              <a href="/termos" className="transition-colors hover:text-white">
                Termos de Uso
              </a>
              <a href="/privacidade" className="transition-colors hover:text-white">
                Politica de Privacidade
              </a>
              <a href="mailto:suporte@atend-ia.com" className="transition-colors hover:text-white">
                suporte@atend-ia.com
              </a>
            </div>

            {/* Social Icons */}
            <div className="flex items-center gap-4">
              <a
                href="https://instagram.com/atendia"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-dark-700 text-dark-400 transition-colors hover:border-primary-500 hover:text-primary-400"
                aria-label="Instagram"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
              </a>
              <a
                href="https://wa.me/5511999999999"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-dark-700 text-dark-400 transition-colors hover:border-accent-500 hover:text-accent-400"
                aria-label="WhatsApp"
              >
                <MessageCircle className="h-5 w-5" />
              </a>
              <a
                href="mailto:suporte@atend-ia.com"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-dark-700 text-dark-400 transition-colors hover:border-primary-500 hover:text-primary-400"
                aria-label="Email"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </a>
            </div>
          </div>

          <div className="mt-8 border-t border-dark-800 pt-8 text-center">
            <p className="text-sm text-dark-500">
              &copy; {new Date().getFullYear()} AtendIA. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
