import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { MsalProvider } from "@azure/msal-react";

import { msalInstance, msalReady } from "./service/auth";
import { PopupProvider } from "@shared/ui/context/PopupContext";
import { AuthProvider } from "@shared/ui/context/AuthContext";
import { EnhancedApolloProvider } from "./providers";
import { AppProvider } from "./context/AppContext";
import LoginPage from "./pages/Login";
import App from "./App";

import "./main.scss";

msalReady.finally(() => {
	// MSAL returns auth responses in the URL fragment (#code=... / #error=...).
	// If handleRedirectPromise failed and left it behind, HashRouter would parse
	// it as a route and render the NotFound page — strip it before mounting.
	if (/^#(code|error|state)=/.test(window.location.hash)) {
		window.history.replaceState(null, "", window.location.pathname + window.location.search);
	}
	createRoot(document.getElementById("root")).render(
		<StrictMode>
			<PopupProvider>
				<MsalProvider instance={msalInstance}>
					<AuthProvider loginComponent={<LoginPage />}>
						<EnhancedApolloProvider>
							<AppProvider>
								<HashRouter>
									<App />
								</HashRouter>
							</AppProvider>
						</EnhancedApolloProvider>
					</AuthProvider>
				</MsalProvider>
			</PopupProvider>
		</StrictMode>
	);
});
