import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useMsal } from "@azure/msal-react";
import { useQuery } from "@apollo/client/react";
import { GET_PROJECTS } from "../../graphql/queries";

import { useAuth } from "@shared/ui/context/AuthContext";

import getInitials from "../../utils/getInitials";
import { getProjectEditorPath } from "../../utils/projectIntake";

import { Button as UIButton, Spinner } from "@shared/ui";

import Icon from "../../components/common/Icon";

import "./index.scss";

export default function Sidebar() {
	const navigate = useNavigate();
	const { instance } = useMsal();
	const location = useLocation();

	const { loading, error, data } = useQuery(GET_PROJECTS);

	const [toggleSidebar, setToggleSidebar] = useState(false);
	const [showLogout, setShowLogout] = useState(false);

	const { userFullName } = useAuth();
	const initials = getInitials(userFullName);

	const handleLogout = () => {
		instance.logoutRedirect({
			postLogoutRedirectUri: window.location.origin,
		});
	};

	const SidebarOpened = () => {
		if (loading) {
			return <Spinner />;
		}
		if (error) {
			return;
		}

		return (
			<>
				<div className="sidebar-opened-top">
					<div className="sidebar-opened-top-logo" onClick={() => navigate("/")}>
						<Icon name={"logo"} />
						<span>Brede Welvaart Scan</span>
					</div>
					<div className="sidebar-opened-divider" />
					<UIButton variant="secondary" onClick={() => navigate("/project/new")}>
						<Icon name={"plus-blue"} />
						Nieuw project
					</UIButton>
					<div className="sidebar-opened-top-saved-projects">
						<span>Opgeslagen projecten</span>
						{/* Scroll List Projects */}
						<div className="overflow-scroll">
						{data?.projects?.map((project) => (
							<UIButton
								key={project.id}
								variant="primary"
								onClick={() => navigate(getProjectEditorPath(project))}
							>
								<Icon name={"document-white"} />
								{project.name}
							</UIButton>
						))}
						</div>
					</div>
				</div>
				<div className="sidebar-opened-bottom">
					<UIButton variant="primary" onClick={() => navigate("/status")}>Status</UIButton>
					<div className="sidebar-opened-divider" />
					<UIButton variant="secondary" onClick={() => navigate("/about")}>
						<Icon name={"question"} />
						Over de Brede Welvaart Scan
					</UIButton>
					<div className="sidebar-opened-divider" />
					<div className="sidebar-opened-bottom-info">
						<span>
							Intern
							<br />
							product van:
						</span>
						<Icon name={"gemeente-logo"} />
					</div>
					<div className="sidebar-opened-divider" />
					<div
						className="sidebar-opened-bottom-person"
						onClick={() => {
							setShowLogout((prev) => !prev);
						}}
					>
						{showLogout && (
							<UIButton variant="secondary" onClick={handleLogout}>
								<Icon name={"logout"} />
								Uitloggen
							</UIButton>
						)}
						<div className="sidebar-opened-bottom-person-initials">
							<span>{initials}</span>
						</div>
						<span>{userFullName}</span>
						<Icon name={`chevron-${showLogout ? "up" : "down"}-white`} />
					</div>
				</div>
			</>
		);
	};

	const SidebarClosed = () => {
		return (
			<>
				<div className="sidebar-closed-top">
					<div className="sidebar-closed-top-logo" onClick={() => navigate("/")}>
						<Icon name={"logo"} />
					</div>
					<div className="sidebar-closed-divider" />
					<UIButton variant="secondary" onClick={() => navigate("/project/new")}>
						<Icon name={"plus-blue"} />
					</UIButton>
				</div>
				<div className="sidebar-closed-bottom">
					<div
						className="sidebar-closed-bottom-initials"
						onClick={() => {
							setToggleSidebar(true);
							setShowLogout(true);
						}}
					>
						<span>{initials}</span>
					</div>
				</div>
			</>
		);
	};

	useEffect(() => {
		setToggleSidebar(location.pathname === "/" ? true : false);
	}, [location]);

	return (
		<aside className={`sidebar ${toggleSidebar ? "sidebar-opened" : "sidebar-closed"}`}>
			<div className="sidebar-button" onClick={() => setToggleSidebar((prev) => !prev)}>
				<Icon name={"chevron-up-white"} />
			</div>
			{toggleSidebar ? <SidebarOpened /> : <SidebarClosed />}
		</aside>
	);
}
