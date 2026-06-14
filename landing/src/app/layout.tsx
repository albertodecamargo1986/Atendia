import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "AtendIA — Atendimento Inteligente no WhatsApp com IA",
  description:
    "Automatize seu atendimento no WhatsApp com Inteligência Artificial. Agente de IA 24h, integração WhatsApp, intervenção humana e configuração simples para seu negocio.",
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
      "Automatize seu atendimento no WhatsApp com Inteligencia Artificial. Agente de IA 24h com intervencao humana em tempo real.",
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
    <html lang="pt-BR" className={inter.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
