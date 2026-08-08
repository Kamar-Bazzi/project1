import { createContext, useContext } from "react";
import type { AuthenticatedUser } from "../../services/auth.service";

export interface AuthContextValue {
  user: AuthenticatedUser;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

export const AuthContext =
  createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside a protected route.",
    );
  }

  return context;
}
