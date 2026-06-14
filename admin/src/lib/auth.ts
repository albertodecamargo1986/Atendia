import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { verifyToken } from "./totp";
import { query } from "./db";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
        totpCode: { label: "Código 2FA", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password || !credentials?.totpCode) {
          throw new Error("Email, senha e código 2FA são obrigatórios");
        }

        const result = await query(
          "SELECT id, email, name, password_hash, totp_secret, role FROM admin_users WHERE email = ? AND is_active = 1",
          [credentials.email]
        );

        const user = result.rows[0];

        if (!user) {
          throw new Error("Credenciais inválidas");
        }

        const isValidPassword = await bcrypt.compare(
          credentials.password,
          user.password_hash
        );

        if (!isValidPassword) {
          throw new Error("Credenciais inválidas");
        }

        const isValidTOTP = verifyToken(user.totp_secret, credentials.totpCode);

        if (!isValidTOTP) {
          throw new Error("Código 2FA inválido");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours
  },
  jwt: {
    maxAge: 8 * 60 * 60,
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
