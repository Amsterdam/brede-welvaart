import {
  ReactNode,
  ReactElement,
  createContext,
  useContext,
  useState,
  useEffect
} from "react";
import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import {
  AccountInfo,
  InteractionRequiredAuthError,
  SilentRequest
} from "@azure/msal-browser";

type AuthProviderProps = {
  children: ReactNode;
  loginComponent: ReactElement;
};

type AuthContextType = {
  isAuthenticated: boolean;
  getAccessToken: () => Promise<string | null>;
  account: AccountInfo | null;
  userFullName: string | null;
};

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  getAccessToken: async () => null,
  account: null,
  userFullName: null
});

export const useAuth = () => useContext(AuthContext);

function isSilentTokenTimeout(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "errorCode" in error &&
      (error as { errorCode?: string }).errorCode === "timed_out"
  );
}

export const AuthProvider = ({
  children,
  loginComponent
}: AuthProviderProps) => {
  const isAuthenticated = useIsAuthenticated();
  const { instance, accounts } = useMsal();
  const account = instance.getActiveAccount() || accounts[0] || null;

  // State to store the user's full name
  const [userFullName, setUserFullName] = useState<string | null>(null);

  // Update userFullName when account changes
  useEffect(() => {
    if (account && account.name) {
      setUserFullName(account.name);
    } else {
      setUserFullName(null);
    }
  }, [account]);

  const getAccessToken = async () => {
    if (!account) return null;

    try {
      instance.setActiveAccount(account);
      const request: SilentRequest = {
        scopes: ["User.Read"],
        account: account
      };

      const response = await instance.acquireTokenSilent(request);
      return response.accessToken;
    } catch (error) {
      if (
        error instanceof InteractionRequiredAuthError ||
        isSilentTokenTimeout(error)
      ) {
        console.error("Interaction required for token:", error);
        throw error;
      } else {
        console.error("Error getting token:", error);
      }
      return null;
    }
  };

  const contextValue: AuthContextType = {
    isAuthenticated,
    getAccessToken,
    account,
    userFullName
  };

  if (!isAuthenticated) {
    return loginComponent;
  }

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
};
