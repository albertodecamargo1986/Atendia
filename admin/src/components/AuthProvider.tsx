"use client";

import { SessionProvider } from "next-auth/react";
import MobileSidebar from "./MobileSidebar";

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <MobileSidebar />
      {children}
    </SessionProvider>
  );
}
