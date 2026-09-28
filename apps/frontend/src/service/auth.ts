import { BrowserAuthError, InteractionRequiredAuthError, PublicClientApplication } from "@azure/msal-browser";
import { setContext } from "@apollo/client/link/context";

export const loginRequest = {
	scopes: ["User.Read"],
};

export const msalConfig = {
	auth: {
		clientId: import.meta.env.VITE_ENTRAID_CLIENT_ID || "",
		authority: import.meta.env.VITE_ENTRAID_AUTHORITY || "",
		redirectUri: import.meta.env.VITE_ENTRAID_LOGIN_REDIRECT_URI || "",
		postLogoutRedirectUri: import.meta.env.VITE_ENTRAID_LOGOUT_REDIRECT_URI || "",
	},
	cache: {
		cacheLocation: "localStorage",
		storeAuthStateInCookie: false,
	},
};

const msalInstance = new PublicClientApplication(msalConfig);
const AUTH_REDIRECT_IN_PROGRESS_KEY = "bwscan.auth.redirectInProgress";

export const msalReady = msalInstance
	.initialize()
	.then(() => msalInstance.handleRedirectPromise())
	.then((response) => {
		if (response && response.account) {
			msalInstance.setActiveAccount(response.account);
			sessionStorage.removeItem(AUTH_REDIRECT_IN_PROGRESS_KEY);
			return response;
		}

		const account = msalInstance.getActiveAccount() || msalInstance.getAllAccounts()[0];
		if (account) {
			msalInstance.setActiveAccount(account);
			sessionStorage.removeItem(AUTH_REDIRECT_IN_PROGRESS_KEY);
		}

		return response;
	})
	.catch((error) => {
		sessionStorage.removeItem(AUTH_REDIRECT_IN_PROGRESS_KEY);
		console.error("[auth] Failed to handle MSAL redirect:", error);
		return null;
	});

export function getMsalAccount() {
	const account = msalInstance.getActiveAccount() || msalInstance.getAllAccounts()[0] || null;
	if (account) {
		msalInstance.setActiveAccount(account);
	}
	return account;
}

export function isSilentTokenRecoveryError(error: unknown) {
	if (error instanceof InteractionRequiredAuthError) {
		return true;
	}

	if (error instanceof BrowserAuthError && error.errorCode === "timed_out") {
		return true;
	}

	return Boolean(
		error &&
			typeof error === "object" &&
			"errorCode" in error &&
			["interaction_required", "consent_required", "login_required", "timed_out"].includes(
				(error as { errorCode?: string }).errorCode || ""
			)
	);
}

export async function redirectToLogin(reason: string) {
	if (sessionStorage.getItem(AUTH_REDIRECT_IN_PROGRESS_KEY)) {
		return;
	}

	sessionStorage.setItem(AUTH_REDIRECT_IN_PROGRESS_KEY, reason);
	await msalReady;

	const account = getMsalAccount();
	if (account) {
		await msalInstance.acquireTokenRedirect({
			...loginRequest,
			account,
		});
		return;
	}

	await msalInstance.loginRedirect(loginRequest);
}

// Global reference to the getAccessToken function from AuthContext
let getAccessTokenFromContext: (() => Promise<string | null>) | null = null;

/**
 * Set the access token getter from AuthContext.
 * This should be called from the AuthProvider after it's initialized.
 */
export const setAuthContextTokenGetter = (getAccessToken: () => Promise<string | null>) => {
	getAccessTokenFromContext = getAccessToken;
};

/**
 * Apollo auth link that injects access tokens into the Authorization header.
 * Uses AuthContext's getAccessToken if available (handles both MSAL and service tokens),
 * falls back to direct MSAL integration for backwards compatibility.
 */
export const authLink = setContext(async (_, { headers }) => {
	try {
		// Try to use AuthContext's getAccessToken first (handles service tokens too)
		if (getAccessTokenFromContext) {
			const token = await getAccessTokenFromContext();
			if (token) {
				return {
					headers: {
						...headers,
						authorization: `Bearer ${token}`,
					},
				};
			}
		}

		// Fallback to direct MSAL integration for backwards compatibility
		const account = getMsalAccount();
		if (!account) {
			console.warn("[authLink] No MSAL account found, starting login redirect.");
			await redirectToLogin("missing-account");
			throw new Error("Authentication required.");
		}

		const tokenResponse = await msalInstance.acquireTokenSilent({
			scopes: loginRequest.scopes,
			account: account || undefined,
		});

		if (tokenResponse && tokenResponse.accessToken) {
			return {
				headers: {
					...headers,
					authorization: `Bearer ${tokenResponse.accessToken}`,
				},
			};
		} else {
			console.warn("[authLink] No access token received from acquireTokenSilent.");
			return { headers };
		}
	} catch (error) {
		console.error("[authLink] Failed to get auth token:", error);
		if (isSilentTokenRecoveryError(error)) {
			await redirectToLogin("silent-token-timeout");
		}
		throw error;
	}
});

export { msalInstance };
/**
 * Returns true if the user is authenticated (has an active account or any account).
 */
export function isAuthenticated() {
	return !!getMsalAccount();
}
