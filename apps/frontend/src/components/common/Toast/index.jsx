import { Alert, Paragraph } from "@amsterdam/design-system-react";

import "./index.scss";

const severityMap = { success: "success", warning: "warning", error: "error" };

const Toast = ({ children, type = "success", position = "bottom" }) => (
	<div className={`toast${position ? ` toast-${position}` : ""}`}>
		<div className="toast-inner">
			<Alert severity={severityMap[type]} compact>
				<Paragraph>{children}</Paragraph>
			</Alert>
		</div>
	</div>
);

export default Toast;
