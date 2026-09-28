import PageHeader from "@frontend/components/custom/A4/PageHeader";
import PageFooter from "@frontend/components/custom/A4/PageFooter";

export default function Page({ currentPage, display, children, subtitle, date, totalPages }) {
	return (
		<div
			className="transformcomponent-page"
			style={{ display: !display && "none" }}
		>
			<PageHeader subtitle={subtitle} />
			<div className="transformcomponent-page-content">{children}</div>
			<PageFooter currentPage={currentPage} date={date} totalPages={totalPages} />
		</div>
	);
}
