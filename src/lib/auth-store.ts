/**
 * Auth Store — Zustand
 *
 * Manages the Supabase Auth session on the client side.
 * - Tracks current user and session
 * - Provides login (email/password), signup, logout, and password reset
 * - Exposes the access token for API calls
 * - Supports username-based login via API lookup
 */

import { create } from 'zustand';
import { supabaseBrowser } from './supabase-browser';

export interface User {
  id: string;
  email: string;
  username?: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;

  // Actions
  initialize: () => Promise<void>;
  signIn: (identifier: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string, username?: string) => Promise<{ success: boolean; error?: string }>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  initialized: false,

  initialize: async () => {
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (session?.user) {
        set({
          user: {
            id: session.user.id,
            email: session.user.email ?? '',
            username: (session.user.user_metadata as Record<string, string>)?.username || undefined,
          },
          loading: false,
          initialized: true,
        });
      } else {
        set({ user: null, loading: false, initialized: true });
      }

      // Listen for auth state changes
      supabaseBrowser.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          set({
            user: {
              id: session.user.id,
              email: session.user.email ?? '',
              username: (session.user.user_metadata as Record<string, string>)?.username || undefined,
            },
            loading: false,
          });
        } else {
          set({ user: null, loading: false });
        }
      });
    } catch {
      set({ user: null, loading: false, initialized: true });
    }
  },

  signIn: async (identifier: string, password: string) => {
    try {
      let email = identifier.trim().toLowerCase();

      // If identifier doesn't contain @, treat as username and look up email
      if (!email.includes('@')) {
        const lookupRes = await fetch('/api/auth/lookup-username', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: identifier.trim() }),
        });
        const lookupData = await lookupRes.json();

        if (!lookupRes.ok || !lookupData.email) {
          return {
            success: false,
            error: lookupData.error || 'Username not found',
          };
        }
        email = lookupData.email;
      }

      // Check if email is trusted before allowing sign in
      const checkRes = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const checkData = await checkRes.json();

      if (!checkRes.ok || !checkData.allowed) {
        return {
          success: false,
          error: checkData.error || 'This email is not authorized. Please contact the administrator.',
        };
      }

      // Sign in with email + password via Supabase Auth
      const { data, error } = await supabaseBrowser.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (data.user) {
        set({
          user: {
            id: data.user.id,
            email: data.user.email ?? '',
            username: (data.user.user_metadata as Record<string, string>)?.username || undefined,
          },
          loading: false,
        });
        return { success: true };
      }

      return { success: false, error: 'Sign in failed' };
    } catch {
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  signUp: async (email: string, password: string, username?: string) => {
    try {
      const trimmedEmail = email.trim().toLowerCase();

      // Check if email is trusted before allowing sign up
      const checkRes = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail }),
      });
      const checkData = await checkRes.json();

      if (!checkRes.ok || !checkData.allowed) {
        return {
          success: false,
          error: checkData.error || 'This email is not authorized. Please contact the administrator.',
        };
      }

      // Check username uniqueness if provided
      if (username && username.trim()) {
        const uname = username.trim().toLowerCase();
        if (uname.length < 3) {
          return { success: false, error: 'Username must be at least 3 characters' };
        }
        if (!/^[a-zA-Z0-9_]+$/.test(uname)) {
          return { success: false, error: 'Username can only contain letters, numbers, and underscores' };
        }

        const checkUsernameRes = await fetch('/api/auth/check-username', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: uname }),
        });
        const checkUsernameData = await checkUsernameRes.json();

        if (!checkUsernameRes.ok || !checkUsernameData.available) {
          return {
            success: false,
            error: checkUsernameData.error || 'This username is already taken',
          };
        }
      }

      // Sign up with email + password via Supabase Auth
      const { data, error } = await supabaseBrowser.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: {
            username: username?.trim() || null,
          },
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (data.user) {
        set({
          user: {
            id: data.user.id,
            email: data.user.email ?? '',
            username: (data.user.user_metadata as Record<string, string>)?.username || undefined,
          },
          loading: false,
        });
        return { success: true };
      }

      return { success: false, error: 'Account creation failed' };
    } catch {
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  resetPassword: async (email: string) => {
    try {
      const { error } = await supabaseBrowser.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/`,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch {
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  logout: async () => {
    await supabaseBrowser.auth.signOut();
    set({ user: null });
  },

  getAccessToken: async () => {
    const { data } = await supabaseBrowser.auth.getSession();
    return data.session?.access_token ?? null;
  },
}));
