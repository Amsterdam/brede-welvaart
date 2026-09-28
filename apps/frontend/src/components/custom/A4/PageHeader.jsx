import logo from "../../../assets/images/logo.svg";

export default function PageHeader({ subtitle }) {
	return (
		<div className="transformcomponent-page-header">
			<img src={logo} alt="" />
			<h1>Brede Welvaart Scan</h1>
			<span>{subtitle}</span>
		</div>
	);
}
