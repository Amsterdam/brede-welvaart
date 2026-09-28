import { Route, Routes, Navigate, useLocation } from "react-router-dom";
import { AuthProvider } from "@shared/ui/context/AuthContext";

import Layout from "../components/custom/Layout";
import ReviewLayout from "../components/custom/Layout/ReviewLayout";
import EditorPreview from "../pages/EditorPreview";
import ShareLinkEntrypoint from "../pages/ShareLinkEntrypoint";
import NotFound from "../pages/NotFound";
import Home from "../pages/Home";
import About from "../pages/About";
import NewProject from "../pages/NewProject";
import Wizard from "../pages/Wizard";
import AIDashboard from "../pages/AIDashboard";
import SourcePage from "../pages/Source";
import Login from "../pages/Login";
import Status from "../pages/Status";

export default function AppRoutes() {
	return (
		<Routes>
			{/* Auth Routes */}
			<Route path="/login" element={<Login />} />

			{/* Review Routes */}
			<Route path="/review" element={<ReviewLayout />}>
				<Route path=":projectSlug" element={<EditorPreview />} />
			</Route>

			{/* Redirects */}

			{/* Owner Routes */}
			<Route path="/" element={<Layout />}>
				<Route index element={<Home />} />
				<Route path="status" element={<Status />} />
				<Route path="about" element={<About />} />
				<Route path="project/new" element={<NewProject />} />
				<Route path="project/:projectSlug/intake" element={<NewProject />} />
				<Route path="project/:projectSlug" element={<Wizard />} />
				<Route path="project/:projectSlug/:themeSlug" element={<Wizard />} />
				<Route path="project/:projectSlug/ai-dashboard" element={<AIDashboard />} />
				<Route path="project/:projectSlug/open-research-source/:sourceId" element={<SourcePage type="open-research" />} />
				<Route path="project/:projectSlug/upload-result/:documentId" element={<SourcePage type="pdf" />} />
				<Route path="preview/:projectSlug" element={<EditorPreview />} />
			</Route>
			<Route path="/share" element={<ReviewLayout />}>
				<Route path="link/:shareLink" element={<ShareLinkEntrypoint />} />
				<Route path="project/:projectSlug" element={<EditorPreview />} />
			</Route>
			<Route path="*" element={<NotFound />} />
		</Routes>
	);
}
