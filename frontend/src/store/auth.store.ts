/** Auth profile state; cookie credentials never enter JavaScript storage, caches isolate identities. */
import { clearIdempotentCache } from "@/lib/idempotentRequest";
import { clearAllCache } from "@/lib/api-cache";
import { setBrowserCsrf, advanceAuthGeneration } from "@/lib/browser-session";
import { clearApiGetCache } from "@/lib/axios";
import { resetExpiredAuthSession } from "@/lib/auth-session";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { User } from "@/types";
import { clearAuthToken, setAuthToken } from "@/lib/auth-token";

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (user: User, token: string | null, csrfToken?: string) => void;
  updateProfile: (profile: Partial<Pick<User, "name" | "avatar">>) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: (user, token, csrfToken) => {
        advanceAuthGeneration();
        clearApiGetCache();
        clearAllCache();
        clearIdempotentCache();
        resetExpiredAuthSession();
        setBrowserCsrf(csrfToken || null);
        set({ user, token, isAuthenticated: true });
        if (token) setAuthToken(token);
        else clearAuthToken();
      },
      updateProfile: (profile) => {
        set((state) => {
          if (!state.user) {
            return state;
          }

          return {
            user: {
              ...state.user,
              ...profile,
            },
          };
        });
      },
      logout: () => {
        advanceAuthGeneration();
        clearApiGetCache();
        clearAllCache();
        clearIdempotentCache();
        setBrowserCsrf(null);
        set({ user: null, token: null, isAuthenticated: false });
        clearAuthToken();
      },
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
