import { Amplify } from "aws-amplify";
import {
  confirmSignUp,
  fetchAuthSession,
  getCurrentUser,
  signIn,
  signOut,
  signUp
} from "aws-amplify/auth";

const appOrigin =
  typeof window !== "undefined" ? window.location.origin : "http://localhost:5173";

const cognitoConfig = {
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || "",
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID || "",
      loginWith: {
        email: true,
        oauth: {
          domain:
            import.meta.env.VITE_COGNITO_DOMAIN ||
            "satup-setup.auth.us-east-1.amazoncognito.com",
          scopes: ["openid", "email", "profile"],
          redirectSignIn: [`${appOrigin}/login`],
          redirectSignOut: [`${appOrigin}/login`],
          responseType: "code"
        }
      }
    }
  }
};

Amplify.configure(cognitoConfig);

function getErrorMessage(error, fallback) {
  if (error?.name === "NotAuthorizedException") {
    return "Incorrect email or password.";
  }
  if (error?.name === "UserNotFoundException") {
    return "No SATUpscale account was found for this email.";
  }
  if (error?.name === "UsernameExistsException") {
    return "An account already exists for this email.";
  }
  if (error?.name === "CodeMismatchException") {
    return "The confirmation code is incorrect.";
  }
  if (error?.name === "ExpiredCodeException") {
    return "That confirmation code has expired. Request a new code.";
  }
  return error?.message || fallback;
}

async function getSessionUser() {
  const currentUser = await getCurrentUser();
  const session = await fetchAuthSession();
  const claims = session.tokens?.idToken?.payload || {};

  return {
    id: currentUser.userId,
    sub: currentUser.userId,
    email: claims.email || currentUser.username,
    name: claims.name || claims.email || currentUser.username
  };
}

export const authService = {
  async getCurrentUser() {
    try {
      return await getSessionUser();
    } catch {
      return null;
    }
  },

  async login(email, password) {
    if (!email || !password) {
      throw new Error("Email and password are required.");
    }

    try {
      const result = await signIn({
        username: email.trim(),
        password
      });

      if (!result.isSignedIn) {
        throw new Error(
          "Additional sign-in verification is required for this account."
        );
      }

      return await getSessionUser();
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to sign in."), {
        cause: error
      });
    }
  },

  async signup(name, email, password) {
    if (!email || !password) {
      throw new Error("Email and password are required.");
    }

    try {
      const result = await signUp({
        username: email.trim(),
        password,
        options: {
          userAttributes: {
            email: email.trim(),
            ...(name?.trim() ? { name: name.trim() } : {})
          }
        }
      });

      if (result.nextStep.signUpStep === "CONFIRM_SIGN_UP") {
        return {
          needsConfirmation: true,
          email: email.trim()
        };
      }

      return await this.login(email, password);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to create account."), {
        cause: error
      });
    }
  },

  async confirmSignup(email, confirmationCode) {
    if (!confirmationCode?.trim()) {
      throw new Error("Enter the confirmation code sent to your email.");
    }

    try {
      await confirmSignUp({
        username: email.trim(),
        confirmationCode: confirmationCode.trim()
      });
      return { confirmed: true };
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to confirm account."), {
        cause: error
      });
    }
  },

  /**
   * Retrieves the Cognito IdToken.
   * NOTE: We specifically use IdToken (NOT AccessToken) because AWS API Gateway
   * COGNITO_USER_POOLS authorizer requires the ID token.
   */
  async getIdToken(forceRefresh = false) {
    const session = await fetchAuthSession({ forceRefresh });
    // Strictly extract IdToken, never AccessToken
    const token = session.tokens?.idToken?.toString();
    if (!token) {
      throw new Error("Your session has expired. Please sign in again.");
    }

    // Securely cache IdToken in localStorage and sessionStorage for quick access
    // and seamless synchronization with the browser extension
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("satup_id_token", token);
        window.sessionStorage.setItem("satup_id_token", token);
      }
    } catch {
      // Storage access may be restricted in private browsing mode
    }

    return token;
  },

  /**
   * Retrieves cached IdToken from localStorage or sessionStorage.
   */
  getStoredIdToken() {
    if (typeof window === "undefined") return null;
    try {
      const token =
        window.localStorage.getItem("satup_id_token") ||
        window.sessionStorage.getItem("satup_id_token");
      if (token) return token;

      // Fallback: check Amplify standard localStorage keys
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (
          key &&
          key.includes("CognitoIdentityServiceProvider") &&
          key.endsWith(".idToken")
        ) {
          return window.localStorage.getItem(key);
        }
      }
    } catch {
      return null;
    }
    return null;
  },

  /**
   * Returns current token payload ensuring only IdToken is provided.
   */
  async getTokens() {
    const idToken = await this.getIdToken();
    return { idToken };
  },

  async refreshUser() {
    return getSessionUser();
  },

  async logout() {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("satup_id_token");
        window.sessionStorage.removeItem("satup_id_token");
        window.localStorage.removeItem("satup_user");
      }
    } catch {
      // ignore storage access issues
    }
    await signOut();
  }
};

