"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Bot, MessageCircle, UserCheck, Settings, Check,
  ChevronDown, Menu, X, Zap, Shield, Headphones,
  ArrowRight, Star, Sparkles, Brain, BarChart3,
  Network, Globe, Volume2, Layers, Cpu, Smartphone, Wallet,
  Monitor, UserPlus, Sliders,
} from "lucide-react";

function formatPrice(price: number): string {
  return price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface Plan {
  id: string;
  name: string;
  price: number;
  discount: number;
  total: number;
  period: string;
  featured: boolean;
  badge?: string;
}

function PlansSection() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPlans() {
      try {
        const res = await fetch("/api/plans", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to fetch plans");
        const data = await res.json();
        setPlans(data);
      } catch (err) {
        console.error("Failed to fetch plans:", err);
        // Fallback prices
        setPlans([
          { id: "mensal", name: "Mensal", price: 147, discount: 0, total: 147, period: "1 mes", featured: false },
          { id: "trimestral", name: "Trimestral", price: 127, discount: 14, total: 381, period: "3 meses", featured: true, badge: "Mais Vendido" },
          { id: "semestral", name: "Semestral", price: 107, discount: 27, total: 642, period: "6 meses", featured: false },
          { id: "anual", name: "Anual", price: 87, discount: 41, total: 1044, period: "12 meses", featured: false },
        ]);
        setError("Using fallback prices");
      } finally {
        setLoading(false);
      }
    }
    fetchPlans();
  }, []);

  if (loading) {
    return (
      <section id="precos" className="section-padding relative overflow-hidden">
        <div className="grid-pattern" />
        <div className="relative container-custom">
          <div className="mx-auto max-w-3xl text-center reveal">
            <span className="mb-4 inline-block rounded-full border border-primary-500/20 bg-primary-500/8 px-5 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary-300">
              Planos
            </span>
            <h2 className="font-display mb-4 text-4xl font-bold text-white sm:text-5xl">
              Escolha o plano ideal<br />
              <span className="text-gradient">para seu negocio</span>
            </h2>
            <p className="text-lg text-dark-300">Carregando preços...</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="precos" className="section-padding relative overflow-hidden">
      <div className="grid-pattern" />
      <div className="relative container-custom">
        <div className="mx-auto max-w-3xl text-center reveal">
          <span className="mb-4 inline-block rounded-full border border-primary-500/20 bg-primary-500/8 px-5 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary-300">
            Planos
          </span>
          <h2 className="font-display mb-4 text-4xl font-bold text-white sm:text-5xl">
            Escolha o plano ideal<br />
            <span className="text-gradient">para seu negocio</span>
          </h2>
          <p className="text-lg text-dark-300">Quanto maior o plano, maior o desconto. Todos incluem tudo.</p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4 stagger-children reveal">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-2xl border p-6 transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl ${
                plan.featured
                  ? "border-primary-500/50 bg-gradient-to-b from-dark-800 to-dark-900 shadow-2xl shadow-primary-500/10 ring-1 ring-primary-500/30"
                  : "border-white/[0.06] bg-dark-800/40 hover:border-white/[0.12]"
              }`}
            >
              {plan.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-primary-500 to-accent-500 px-4 py-1 text-xs font-bold text-white shadow-lg">
                    <Star className="h-3 w-3" /> {plan.badge}
                  </span>
                </div>
              )}

              <h3 className="mb-2 text-lg font-bold text-white">{plan.name}</h3>

              {plan.discount > 0 && (
                <span className="mb-2 inline-block rounded-full bg-emerald-500/10 px-3 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
                  {plan.discount}% OFF
                </span>
              )}

              <div className="mt-4">
                <span className="font-display text-4xl font-extrabold text-white">{formatPrice(plan.price)}</span>
                <span className="text-dark-400">/mes</span>
              </div>
              <p className="mt-2 text-sm text-dark-500">Total: {formatPrice(plan.total)} ({plan.period})</p>

              <div className="mt-6 space-y-3 border-t border-white/[0.04] pt-6">
                {includedItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2.5">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20">
                      <Check className="h-3 w-3 text-emerald-400" />
                    </div>
                    <span className="text-sm text-dark-200">{item}</span>
                  </div>
                ))}
              </div>

              <Link
                href={`/checkout?plan=${plan.id}`}
                className={`mt-8 flex items-center justify-center gap-2 rounded-xl py-3 text-center text-sm font-semibold transition-all duration-300 ${
                  plan.featured
                    ? "btn-primary !text-sm !py-3 shadow-lg shadow-primary-500/20"
                    : "border border-white/[0.08] text-dark-200 hover:border-white/20 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                Comprar {plan.name}
              </Link>
            </div>
          ))}
        </div>

        <div className="mt-10 flex items-center justify-center gap-2 text-sm text-dark-500 reveal">
          <Shield className="h-4 w-4 text-emerald-400" />
          Pagamento seguro via <strong className="text-dark-200">Mercado Pago</strong> &mdash; PIX e cartao de credito
        </div>
      </div>
    </section>
  );
}

function MagneticButton({ children, className = "", href, onClick, ...props }: any) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) * 0.2;
    const y = (e.clientY - rect.top - rect.height / 2) * 0.2;
    setPosition({ x, y });
  };
  
  const handleMouseLeave = () => setPosition({ x: 0, y: 0 });
  
  const Tag = href ? "a" : "button";
  
  return (
    <Tag
      ref={ref as any}
      href={href}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      className={className + " transition-transform duration-200 ease-out"}
      {...props}
    >
      {children}
    </Tag>
  );
}

function CursorFollower() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);
  const cursorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
      if (!visible) setVisible(true);
    };
    const leave = () => setVisible(false);
    const enter = () => setVisible(true);
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseleave", leave);
    document.addEventListener("mouseenter", enter);
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseleave", leave);
      document.removeEventListener("mouseenter", enter);
    };
  }, [visible]);

  if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) return null;

  return (
    <div
      ref={cursorRef}
      className="pointer-events-none fixed z-[9999] hidden lg:block"
      style={{
        left: pos.x - 15,
        top: pos.y - 15,
        opacity: visible ? 1 : 0,
        transition: "opacity 0.3s ease",
      }}
    >
      <div className="h-[30px] w-[30px] rounded-full border border-primary-500/50 backdrop-blur-sm" />
    </div>
  );
}

function useRevealObserver() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.1 }
    );
    const elements = document.querySelectorAll(".reveal");
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}


export default function HomePage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  useRevealObserver();

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-dark-950 text-white selection:bg-primary-500/30 selection:text-white">
      <CursorFollower />

      {/* NAV */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrollY > 50
          ? "bg-dark-950/80 border-b border-white/5 backdrop-blur-2xl shadow-[0_4px_30px_rgba(0,0,0,0.3)]"
          : "bg-transparent"
      }`}>
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 lg:px-8">
          <Link href="/" className="group flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 shadow-lg shadow-primary-500/25 transition-all duration-300 group-hover:shadow-primary-500/40 group-hover:scale-105">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <span className="font-display text-xl text-white">
              Atend<span className="text-primary-500">IA</span>
            </span>
          </Link>

          <div className="hidden items-center gap-10 md:flex">
            <a href="#recursos" className="nav-link">Recursos</a>
            <a href="#precos" className="nav-link">Planos</a>
            <a href="#faq" className="nav-link">FAQ</a>
            <MagneticButton
              href="/checkout?plan=trimestral"
              className="btn-primary !py-2.5 !px-6 !text-sm"
            >
              <span>Comecar Agora</span>
            </MagneticButton>
          </div>

          <button
            className="md:hidden text-white/80 hover:text-white transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="border-t border-white/5 bg-dark-950/95 backdrop-blur-2xl md:hidden">
            <div className="flex flex-col gap-3 px-6 py-6">
              <a href="#recursos" className="text-dark-300 hover:text-white py-2 transition-colors" onClick={() => setMobileMenuOpen(false)}>Recursos</a>
              <a href="#precos" className="text-dark-300 hover:text-white py-2 transition-colors" onClick={() => setMobileMenuOpen(false)}>Planos</a>
              <a href="#faq" className="text-dark-300 hover:text-white py-2 transition-colors" onClick={() => setMobileMenuOpen(false)}>FAQ</a>
              <Link href="/checkout?plan=trimestral" className="btn-primary !py-2.5 !text-sm text-center" onClick={() => setMobileMenuOpen(false) as any}>
                Comecar Agora
              </Link>
            </div>
          </div>
        )}
      </nav>


      {/* HERO */}
      <section className="relative min-h-screen flex items-center overflow-hidden pt-20">
        <div className="noise-overlay" />
        <div className="mesh-gradient" />
        <div className="grid-pattern" />

        <div className="orb orb-primary" style={{ width: "600px", height: "600px", top: "-10%", right: "-10%" }} />
        <div className="orb orb-accent" style={{ width: "400px", height: "400px", bottom: "20%", left: "-5%" }} />

        <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8 py-20 lg:py-0">
          <div className="grid items-center gap-16 lg:grid-cols-2 lg:gap-20">
            <div className="reveal visible">
              <div className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-primary-500/20 bg-primary-500/10 px-4 py-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span className="text-sm font-medium text-primary-300">Sistema em producao</span>
              </div>

              <h1 className="font-display mb-6 text-5xl leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl xl:text-8xl">
                Automatize seu
                <br />
                <span className="text-gradient">atendimento</span>
                <br />
                no WhatsApp
              </h1>

              <p className="mb-10 max-w-lg text-lg leading-relaxed text-dark-300 sm:text-xl">
                Agente de IA 24h com intervencao humana em tempo real.
                Simples de configurar, pronto para transformar o atendimento do seu negocio.
              </p>

              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <MagneticButton
                  href="/checkout?plan=trimestral"
                  className="btn-primary group !text-lg"
                >
                  <span>Comecar Agora</span>
                  <ArrowRight className="relative z-10 h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
                </MagneticButton>
                <a href="#recursos" className="btn-secondary !border-white/10 !text-dark-200 hover:!text-white">
                  Ver Recursos
                </a>
              </div>

              <div className="mt-12 flex flex-wrap items-center gap-8 text-sm text-dark-400">
                <span className="flex items-center gap-2"><Shield className="h-4 w-4 text-emerald-400" /> Pagamento seguro</span>
                <span className="flex items-center gap-2"><Headphones className="h-4 w-4 text-emerald-400" /> Suporte dedicado</span>
                <span className="flex items-center gap-2"><Zap className="h-4 w-4 text-emerald-400" /> 14 dias gratis</span>
              </div>
            </div>

            <div className="relative hidden lg:block reveal visible reveal-delay-2">
              <div className="animate-float-slow">
                <div className="absolute -inset-6 rounded-[32px] bg-gradient-to-r from-primary-500/20 via-accent-500/10 to-primary-500/20 blur-3xl" />
                <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-dark-900/60 p-1 shadow-2xl backdrop-blur-xl">
                  <div className="flex items-center gap-2 rounded-t-xl bg-dark-800/80 px-5 py-3.5">
                    <div className="h-3 w-3 rounded-full bg-red-500/80" />
                    <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
                    <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
                    <span className="ml-4 text-xs font-medium text-dark-400">AtendIA v2.0</span>
                    <span className="ml-auto flex items-center gap-1.5 text-[10px] text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Online
                    </span>
                  </div>
                  <div className="grid grid-cols-12 gap-0">
                    <div className="col-span-3 border-r border-white/[0.04] p-4">
                      <div className="mb-5 flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-600">
                          <Bot className="h-4 w-4 text-white" />
                        </div>
                        <span className="text-sm font-semibold text-white">AtendIA</span>
                      </div>
                      <div className="space-y-1.5">
                        <div className="rounded-lg bg-primary-500/10 px-3.5 py-2.5 text-xs font-medium text-primary-300 border border-primary-500/10">Conversas</div>
                        <div className="rounded-lg px-3.5 py-2.5 text-xs text-dark-400 hover:text-white/70 transition-colors">Configuracoes</div>
                        <div className="rounded-lg px-3.5 py-2.5 text-xs text-dark-400 hover:text-white/70 transition-colors">Relatorios</div>
                        <div className="rounded-lg px-3.5 py-2.5 text-xs text-dark-400 hover:text-white/70 transition-colors">Assinatura</div>
                      </div>
                      <div className="mt-8 rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-3.5">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-emerald-400" />
                          <span className="text-xs font-medium text-emerald-300">IA Ativa</span>
                        </div>
                        <p className="mt-1 text-[10px] text-dark-500">Conectado ao WhatsApp</p>
                      </div>
                    </div>
                    <div className="col-span-9 flex flex-col">
                      <div className="border-b border-white/[0.04] px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600">
                            <MessageCircle className="h-4 w-4 text-white" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">Cliente WhatsApp</p>
                            <p className="text-[10px] text-emerald-400">Online</p>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-3 p-5">
                        <div className="flex justify-start">
                          <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-dark-700/60 px-4 py-3">
                            <p className="text-xs text-dark-200">Ola, gostaria de saber sobre o produto X</p>
                            <span className="text-[9px] text-dark-500 mt-1 block">10:32</span>
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-gradient-to-r from-primary-600/80 to-primary-500/60 px-4 py-3">
                            <p className="text-xs text-white">Ola! Claro, posso te ajudar...</p>
                            <span className="text-[9px] text-primary-200 mt-1 block">10:32</span>
                          </div>
                        </div>
                        <div className="flex justify-start">
                          <div className="max-w-[80%] rounded-xl bg-dark-700/60 px-4 py-3">
                            <p className="text-xs text-dark-200">Qual o preco?</p>
                            <span className="text-[9px] text-dark-500 mt-1 block">10:33</span>
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-gradient-to-r from-primary-600/80 to-primary-500/60 px-4 py-3">
                            <p className="text-xs text-white">O preco do produto X e R$ 99,90.</p>
                            <span className="text-[9px] text-primary-200 mt-1 block">10:33</span>
                          </div>
                        </div>
                      </div>
                      <div className="border-t border-white/[0.04] p-3">
                        <div className="flex items-center gap-2 rounded-xl bg-dark-700/40 px-4 py-3">
                          <span className="text-xs text-dark-500">Digite sua mensagem...</span>
                          <div className="ml-auto"><UserCheck className="h-4 w-4 text-dark-500" /></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="recursos" className="section-padding relative overflow-hidden">
        <div className="noise-overlay" />
        <div className="absolute inset-0 bg-dark-950/50" />
        <div className="relative container-custom">
          <div className="mx-auto max-w-3xl text-center reveal">
            <span className="mb-4 inline-block rounded-full border border-primary-500/20 bg-primary-500/8 px-5 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary-300">
              Recursos
            </span>
            <h2 className="font-display mb-4 text-4xl font-bold text-white sm:text-5xl">
              Tudo que voce precisa em<br />
              <span className="text-gradient">um so lugar</span>
            </h2>
          </div>

          <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 stagger-children reveal">
            {features.map((f, i) => (
              <div key={i} className="card-glass group p-6">
                <div className={`mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${f.bg} ${f.col} transition-all duration-500 group-hover:scale-110`}>
                  <f.icon className="h-7 w-7" />
                </div>
                <h3 className="mb-3 text-lg font-bold text-white">{f.title}</h3>
                <p className="text-sm leading-relaxed text-dark-300">{f.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-24 grid gap-6 sm:grid-cols-2 lg:grid-cols-4 stagger-children reveal">
            {extraFeatures.map((f, i) => (
              <div key={i} className="flex items-start gap-4 rounded-xl border border-white/[0.04] bg-white/[0.02] p-5 transition-all duration-300 hover:border-white/[0.08] hover:bg-white/[0.04]">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary-500/10 text-primary-400">
                  <f.icon className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">{f.title}</h4>
                  <p className="mt-1 text-xs text-dark-400">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="section-padding relative overflow-hidden">
        <div className="mesh-gradient opacity-30" />
        <div className="relative container-custom">
          <div className="mx-auto max-w-3xl text-center reveal">
            <span className="mb-4 inline-block rounded-full border border-accent-500/20 bg-accent-500/8 px-5 py-1.5 text-xs font-semibold uppercase tracking-wider text-accent-300">
              Como funciona
            </span>
            <h2 className="font-display mb-4 text-4xl font-bold text-white sm:text-5xl">
              Comece em <span className="text-gradient">3 passos</span>
            </h2>
            <p className="text-lg text-dark-300">Do pagamento ao atendimento automatico em minutos.</p>
          </div>

          <div className="mt-20 grid gap-12 md:grid-cols-3">
            {steps.map((step, i) => (
              <div key={i} className="relative text-center reveal">
                {i < steps.length - 1 && (
                  <div className="absolute left-[60%] top-12 hidden h-px w-[80%] bg-gradient-to-r from-primary-500/40 to-accent-500/40 md:block" />
                )}
                <div className="mx-auto mb-8 flex h-28 w-28 items-center justify-center">
                  <div className="absolute h-28 w-28 animate-pulse-glow rounded-full bg-primary-500/10 blur-xl" />
                  <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-white/[0.06] bg-dark-800/80 backdrop-blur-sm">
                    <step.icon className="h-10 w-10 text-primary-400" />
                    <span className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-accent-500 text-sm font-bold text-white shadow-lg">
                      {step.number}
                    </span>
                  </div>
                </div>
                <h3 className="mb-3 text-xl font-bold text-white">{step.title}</h3>
                <p className="mx-auto max-w-xs text-sm leading-relaxed text-dark-300">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="precos" className="section-padding relative overflow-hidden">
        <div className="grid-pattern" />
        <div className="relative container-custom">
          <div className="mx-auto max-w-3xl text-center reveal">
            <span className="mb-4 inline-block rounded-full border border-primary-500/20 bg-primary-500/8 px-5 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary-300">
              Planos
            </span>
            <h2 className="font-display mb-4 text-4xl font-bold text-white sm:text-5xl">
              Escolha o plano ideal<br />
              <span className="text-gradient">para seu negocio</span>
            </h2>
            <p className="text-lg text-dark-300">Quanto maior o plano, maior o desconto. Todos incluem tudo.</p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4 stagger-children reveal">
            {plans.map((plan) => (
              <div key={plan.id}
                className={`relative rounded-2xl border p-6 transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl ${
                  plan.featured
                    ? "border-primary-500/50 bg-gradient-to-b from-dark-800 to-dark-900 shadow-2xl shadow-primary-500/10 ring-1 ring-primary-500/30"
                    : "border-white/[0.06] bg-dark-800/40 hover:border-white/[0.12]"
                }`}
              >
                {plan.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-primary-500 to-accent-500 px-4 py-1 text-xs font-bold text-white shadow-lg">
                      <Star className="h-3 w-3" /> {plan.badge}
                    </span>
                  </div>
                )}

                <h3 className="mb-2 text-lg font-bold text-white">{plan.name}</h3>

                {plan.discount > 0 && (
                  <span className="mb-2 inline-block rounded-full bg-emerald-500/10 px-3 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
                    {plan.discount}% OFF
                  </span>
                )}

                <div className="mt-4">
                  <span className="font-display text-4xl font-extrabold text-white">{formatPrice(plan.priceMonth || plan.price)}</span>
                  <span className="text-dark-400">/mes</span>
                </div>
                <p className="mt-2 text-sm text-dark-500">Total: {formatPrice(plan.total || (plan.priceMonth || plan.price) * (plan.period === "1 mes" ? 1 : plan.period === "3 meses" ? 3 : 12))} ({plan.period})</p>

                <div className="mt-6 space-y-3 border-t border-white/[0.04] pt-6">
                  {includedItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2.5">
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20">
                        <Check className="h-3 w-3 text-emerald-400" />
                      </div>
                      <span className="text-sm text-dark-200">{item}</span>
                    </div>
                  ))}
                </div>

                <Link href={`/checkout?plan=${plan.id}`}
                  className={`mt-8 flex items-center justify-center gap-2 rounded-xl py-3 text-center text-sm font-semibold transition-all duration-300 ${
                    plan.featured
                      ? "btn-primary !text-sm !py-3 shadow-lg shadow-primary-500/20"
                      : "border border-white/[0.08] text-dark-200 hover:border-white/20 hover:text-white hover:bg-white/[0.04]"
                  }`}
                >
                  Comprar {plan.name}
                </Link>
              </div>
            ))}
          </div>

          <div className="mt-10 flex items-center justify-center gap-2 text-sm text-dark-500 reveal">
            <Shield className="h-4 w-4 text-emerald-400" />
            Pagamento seguro via <strong className="text-dark-200">Mercado Pago</strong> &mdash; PIX e cartao de credito
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="section-padding relative overflow-hidden">
        <div className="mesh-gradient opacity-30" />
        <div className="relative container-custom">
          <div className="mx-auto max-w-3xl text-center reveal">
            <span className="mb-4 inline-block rounded-full border border-accent-500/20 bg-accent-500/8 px-5 py-1.5 text-xs font-semibold uppercase tracking-wider text-accent-300">
              Depoimentos
            </span>
            <h2 className="font-display mb-4 text-4xl font-bold text-white sm:text-5xl">
              Quem usa <span className="text-gradient">recomenda</span>
            </h2>
          </div>

          <div className="mt-16 grid gap-6 md:grid-cols-3 stagger-children reveal">
            {testimonials.map((t, i) => (
              <div key={i} className="card-glass p-8 flex flex-col">
                <div className="mb-6 flex gap-1">
                  {[...Array(5)].map((_, j) => (
                    <Star key={j} className="h-4 w-4 fill-accent-500 text-accent-500" />
                  ))}
                </div>
                <p className="flex-1 text-sm leading-relaxed text-dark-200">{t.text}</p>
                <div className="mt-6 flex items-center gap-3 border-t border-white/[0.04] pt-6">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br ${t.gradient} text-sm font-bold text-white shadow-lg`}>
                    {t.initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{t.name}</p>
                    <p className="text-xs text-dark-400">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16 grid grid-cols-3 gap-8 max-w-2xl mx-auto reveal">
            <div className="text-center">
              <div className="font-display text-4xl font-bold text-gradient">+500</div>
              <div className="text-sm text-dark-400 mt-1">empresas cadastradas</div>
            </div>
            <div className="text-center">
              <div className="font-display text-4xl font-bold text-gradient">98%</div>
              <div className="text-sm text-dark-400 mt-1">de satisfacao</div>
            </div>
            <div className="text-center">
              <div className="font-display text-4xl font-bold text-gradient">12s</div>
              <div className="text-sm text-dark-400 mt-1">tempo medio resposta</div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="section-padding relative overflow-hidden">
        <div className="grid-pattern" />
        <div className="relative container-custom">
          <div className="mx-auto max-w-3xl text-center reveal">
            <span className="mb-4 inline-block rounded-full border border-primary-500/20 bg-primary-500/8 px-5 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary-300">
              FAQ
            </span>
            <h2 className="font-display mb-4 text-4xl font-bold text-white sm:text-5xl">
              Perguntas <span className="text-gradient">Frequentes</span>
            </h2>
          </div>

          <div className="mx-auto mt-16 max-w-3xl space-y-3 reveal">
            {faqs.map((faq, i) => (
              <div key={i} className="overflow-hidden rounded-2xl border border-white/[0.04] bg-dark-800/40 transition-all duration-300 hover:border-white/[0.08]">
                <button
                  className="flex w-full items-center justify-between px-6 py-5 text-left"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="pr-4 text-base font-semibold text-white">{faq.q}</span>
                  <ChevronDown
                    className={`h-5 w-5 flex-shrink-0 text-dark-400 transition-transform duration-300 ${
                      openFaq === i ? "rotate-180 text-primary-400" : ""
                    }`}
                  />
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${openFaq === i ? "max-h-96" : "max-h-0"}`}>
                  <div className="border-t border-white/[0.04] px-6 py-5">
                    <p className="text-sm leading-relaxed text-dark-300">{faq.a}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="mesh-gradient" />
          <div className="grid-pattern" />
        </div>
        <div className="orb orb-primary" style={{ width: "400px", height: "400px", top: "-20%", right: "-10%" }} />
        <div className="orb orb-accent" style={{ width: "300px", height: "300px", bottom: "-20%", left: "-10%" }} />

        <div className="relative container-custom text-center">
          <h2 className="font-display mx-auto max-w-3xl text-4xl font-bold text-white sm:text-5xl lg:text-6xl reveal">
            Pronto para transformar<br />
            <span className="text-gradient">seu atendimento?</span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg text-dark-300 reveal reveal-delay-1">
            Junte-se a centenas de negocios que ja automatizaram o atendimento com AtendIA.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row reveal reveal-delay-2">
            <MagneticButton href="/checkout?plan=trimestral" className="btn-primary group !text-lg">
              <span>Comecar Agora — 14 dias gratis</span>
              <ArrowRight className="relative z-10 h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
            </MagneticButton>
          </div>
          <p className="mt-8 flex items-center justify-center gap-2 text-sm text-dark-500 reveal reveal-delay-3">
            <Shield className="h-4 w-4 text-emerald-400" />
            Checkout seguro via Mercado Pago
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/[0.04] bg-dark-950 py-16">
        <div className="container-custom px-6 lg:px-8">
          <div className="flex flex-col items-center gap-10 md:flex-row md:justify-between">
            <Link href="/" className="group flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-600">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <span className="font-display text-xl text-white">
                Atend<span className="text-primary-500">IA</span>
              </span>
            </Link>

            <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-dark-400">
              <a href="/termos" className="transition-colors hover:text-white">Termos de Uso</a>
              <a href="/privacidade" className="transition-colors hover:text-white">Politica de Privacidade</a>
              <a href="mailto:suporte@atend-ia.com" className="transition-colors hover:text-white">suporte@atend-ia.com</a>
            </div>

            <div className="flex items-center gap-3">
              <a href="https://instagram.com/atendia" target="_blank" rel="noopener noreferrer"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] text-dark-400 transition-all duration-300 hover:border-primary-500/50 hover:text-primary-400 hover:bg-primary-500/10"
                aria-label="Instagram"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
              </a>
              <a href="https://wa.me/5511999999999" target="_blank" rel="noopener noreferrer"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] text-dark-400 transition-all duration-300 hover:border-accent-500/50 hover:text-accent-400 hover:bg-accent-500/10"
                aria-label="WhatsApp"
              >
                <MessageCircle className="h-4 w-4" />
              </a>
              <a href="mailto:suporte@atend-ia.com"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] text-dark-400 transition-all duration-300 hover:border-primary-500/50 hover:text-primary-400 hover:bg-primary-500/10"
                aria-label="Email"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </a>
            </div>
          </div>

          <div className="mt-12 border-t border-white/[0.04] pt-8 text-center">
            <p className="text-sm text-dark-500">&copy; {new Date().getFullYear()} AtendIA. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
