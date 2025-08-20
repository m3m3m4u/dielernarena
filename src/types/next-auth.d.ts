import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user?: {
      id?: string;
      username?: string;
      name?: string;
      role?: 'learner' | 'author' | 'teacher' | 'admin' | 'pending-author' | 'pending-teacher';
    } & DefaultSession["user"];
  }
  interface User {
    id?: string;
    username?: string;
    name?: string;
    role?: 'learner' | 'author' | 'teacher' | 'admin' | 'pending-author' | 'pending-teacher';
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    username?: string;
    role?: 'learner' | 'author' | 'teacher' | 'admin' | 'pending-author' | 'pending-teacher';
  }
}
