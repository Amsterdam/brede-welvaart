import { Outlet } from "react-router-dom";

import { useApp } from "../../../context/AppContext";

import CommentsList from "../Comments/CommentsList";

export default function ReviewLayout() {
	const { commentMode } = useApp();

	return (
		<div className={`App-layout ${commentMode && "App-layout-share"}`}>
			<Outlet />
			{commentMode && <CommentsList />}
		</div>
	);
}
