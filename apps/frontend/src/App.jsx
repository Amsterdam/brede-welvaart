import { useEffect, useState } from "react";
import { useMutation } from "@apollo/client/react";

import { PopupManager } from "@shared/ui/components/Popup";
import { Heading } from "@amsterdam/design-system-react";

import UnsupportedScreen from "./layouts/UnsupportedScreen";

import AppRoutes from "./routes";
import { SETUP_DEMO } from "./graphql/mutations";

import "./App.scss";
import "../src/assets/scss/breakpoints.scss";
import "../src/assets/scss/fonts.scss";
import "../src/assets/scss/icons.scss";
import "../src/assets/scss/variables.scss";

import moment from "moment";
import "moment/locale/nl";
moment.locale("nl");

export default function App() {
	const [tooSmall, setTooSmall] = useState(false);

	const handleResize = () => {
		if (process.env.NODE_ENV === "development") return;
		if (window.innerWidth < 1250) {
			setTooSmall(true);
			return;
		}
		setTooSmall(false);
	};

	return (
		<div className="App">
			{tooSmall ? (
				<UnsupportedScreen />
			) : (
				<>
					<PopupManager />
					<AppRoutes />
				</>
			)}
		</div>
	);
}
