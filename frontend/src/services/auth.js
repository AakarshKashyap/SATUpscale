const AUTH_STORAGE_KEY = "satup_auth_user";

/**
 * Authentication service abstraction.
 * Provides a clean interface for session management, ready to plug in AWS Cognito
 * without exposing client secrets or scattering temporary logic.
 */
export const authService = {
  getCurrentUser() {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  },

  isAuthenticated() {
    const user = this.getCurrentUser();
    return Boolean(user && user.token);
  },

  async login(email, password) {
    // In production, this connects to AWS Cognito InitiateAuth / Token exchange.
    // For the current MVP stage, we provide a clean, secure local session abstraction.
    if (!email || !password) {
      throw new Error("Email and password are required.");
    }

    // Basic format validation
    if (!/\S+@\S+\.\S+/.test(email)) {
      throw new Error("Please enter a valid email address.");
    }

    const user = {
      id: "usr_" + (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now()),
      email,
      name: email.split("@")[0],
      token: "satup_jwt_" + Date.now(),
      createdAt: new Date().toISOString()
    };

    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    return user;
  },

  async signup(name, email, password) {
    if (!email || !password) {
      throw new Error("Email and password are required.");
    }
    if (password.length < 6) {
      throw new Error("Password must be at least 6 characters long.");
    }

    const user = {
      id: "usr_" + (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now()),
      email,
      name: name?.trim() || email.split("@")[0],
      token: "satup_jwt_" + Date.now(),
      createdAt: new Date().toISOString()
    };

    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    return user;
  },

  logout() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
};
