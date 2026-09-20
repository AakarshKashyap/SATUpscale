import { useState, useEffect } from "react";
import { AuthContext } from "./auth-context";
import { authService } from "../services/auth";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    authService
      .getCurrentUser()
      .then((currentUser) => {
        if (active) {
          setUser(currentUser);
        }
      })
      .catch((err) => {
        console.error("Failed to restore auth session:", err);
        if (active) {
          setUser(null);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    const handleAuthExpired = () => {
      if (active) setUser(null);
    };
    window.addEventListener("satup:auth-expired", handleAuthExpired);

    return () => {
      active = false;
      window.removeEventListener("satup:auth-expired", handleAuthExpired);
    };
  }, []);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const loggedUser = await authService.login(email, password);
      setUser(loggedUser);
      return loggedUser;
    } finally {
      setLoading(false);
    }
  };

  const signup = async (name, email, password) => {
    setLoading(true);
    try {
      const newUser = await authService.signup(name, email, password);
      if (!newUser?.needsConfirmation) {
        setUser(newUser);
      }
      return newUser;
    } finally {
      setLoading(false);
    }
  };

  const confirmSignup = async (email, confirmationCode) => {
    setLoading(true);
    try {
      return await authService.confirmSignup(email, confirmationCode);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    return authService.logout().finally(() => setUser(null));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        loading,
        login,
        signup,
        confirmSignup,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
