import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AtendIA — Atendimento Inteligente no WhatsApp com IA",
  description:
    "Automatize seu atendimento no WhatsApp com Inteligência Artificial. Agente de IA 24h, integração WhatsApp, intervenção humana e configuração simples para seu negócio.",
  keywords: [
    "atendimento WhatsApp",
    "IA atendimento",
    "chatbot WhatsApp",
    "inteligencia artificial",
    "automacao atendimento",
    "atendente virtual",
    "AtendIA",
  ],
  authors: [{ name: "AtendIA" }],
  openGraph: {
    title: "AtendIA — Atendimento Inteligente no WhatsApp com IA",
    description:
      "Automatize seu atendimento no WhatsApp com Inteligência Artificial. Agente de IA 24h com intervenção humana em tempo real.",
    type: "website",
    locale: "pt_BR",
    siteName: "AtendIA",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="font-body antialiased">{children}</body>
    </html>
  );
}