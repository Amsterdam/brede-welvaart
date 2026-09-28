import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { useApp } from "../../../context/AppContext";

import Sidebar from "../../../layouts/Sidebar";
import Header from "../../../layouts/Header";
import CommentsList from "../Comments/CommentsList";

export default function Layout() {
	const { commentMode, setCommentMode } = useApp();
	const location = useLocation();

	const [isHome, setIsHome] = useState(location.pathname === "/");

	useEffect(() => {
		setIsHome(location.pathname === "/");
		if (!location.pathname.includes("/project") && !location.pathname.includes("/preview")) {
			setCommentMode(false);
		}
	}, [location]);

	const routeUsesOwnHeader =
		location.pathname.endsWith("/ai-dashboard") ||
		location.pathname.includes("/open-research-source/") ||
		location.pathname.includes("/upload-result/");

	return (
		<>
			<Sidebar />
			<div className={`App-layout ${isHome && "App-layout-home"}`}>
				{!routeUsesOwnHeader && <Header />}
				<div className={`App-layout-route ${commentMode && "App-layout-route-with-comments"}`}>
					<Outlet />
					{commentMode && <CommentsList />}
				</div>
			</div>
		</>
	);
}
