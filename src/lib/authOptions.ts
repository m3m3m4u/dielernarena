import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import dbConnect from "@/lib/db";
import User, { IUser } from "@/models/User";
import { compare } from "bcryptjs";
import { getServerSession } from 'next-auth/next';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Benutzername", type: "text" },
        password: { label: "Passwort", type: "password" },
      },
      async authorize(credentials) {
        const wantUser = String(credentials?.username || '');
        const wantPass = String(credentials?.password || '');
        const allowDemo = process.env.NODE_ENV !== 'production';
        const hasDb = !!process.env.MONGODB_URI;
        // Dev-Shortcut: Wenn keine DB konfiguriert ist, optional Demo-Login zulassen
        if (!hasDb && allowDemo) {
          if (wantUser === 'Kopernikus' && wantPass === '12345') {
            return { id: 'demo', name: 'Kopernikus', username: 'Kopernikus', role: 'admin' } as unknown as any;
          }
          throw new Error('Datenbank nicht konfiguriert (MONGODB_URI). Für Demo-Login: Benutzer "Kopernikus" / Passwort "12345" verwenden.');
        }
        try {
          await dbConnect();
    } catch (e) {
          if (allowDemo && wantUser === 'Kopernikus' && wantPass === '12345') {
      return { id: 'demo', name: 'Kopernikus', username: 'Kopernikus', role: 'admin' } as unknown as any;
          }
          throw e;
        }
  const user = await User.findOne({ username: credentials?.username });
        if (!user) { console.warn('[auth] user not found', credentials?.username); throw new Error("Benutzer nicht gefunden"); }
        if (!credentials?.password) throw new Error("Passwort fehlt");
        const isValid = await compare(credentials.password, user.password);
        if (!isValid) { console.warn('[auth] invalid password for', credentials?.username); throw new Error("Falsches Passwort"); }
  const uDoc = user as unknown as IUser;
  const id = uDoc?._id ? String(uDoc._id) : (user.id ? String(user.id) : undefined);
  const rawRole = uDoc?.role ? String(uDoc.role) : 'learner';
        // pending-author hat noch keine Rechte wie author
        return {
          id,
          name: uDoc?.name,
          username: uDoc?.username,
          role: rawRole
        } as unknown as any; // NextAuth v4 erwartet ein User-ähnliches Objekt
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as { id?: string; username?: string; name?: string; role?: string };
        if (u.id) (token as Record<string, unknown>).id = u.id;
        if (u.username) (token as Record<string, unknown>).username = u.username;
        if (u.name) token.name = u.name;
        if (u.role) (token as Record<string, unknown>).role = u.role;
      }
      // Dev-Fallback: spezieller fester Autor (nur außerhalb Produktion)
      const tokAny = token as Record<string, unknown>;
      if (process.env.NODE_ENV !== 'production' && tokAny.username === 'Kopernikus' && tokAny.role !== 'admin') {
        tokAny.role = 'admin';
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        const t = token as { id?: string; sub?: string; username?: string; name?: string; role?: 'learner' | 'author' | 'teacher' | 'admin' | 'pending-author' | 'pending-teacher' };
        session.user = {
          ...session.user,
          ...(t.id ? { id: t.id } : (t.sub ? { id: String(t.sub) } : {})),
          ...(t.username ? { username: t.username } : {}),
          ...(t.name ? { name: t.name } : {}),
          ...(t.role ? { role: t.role } : {})
        } as typeof session.user;
      }
      return session;
    },
  },
};

export async function getSessionServer() { return getServerSession(authOptions); }
