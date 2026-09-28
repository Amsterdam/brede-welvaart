import { useDynamicSvgImport } from "../../../hooks/useDynamicSvgImport";

export default function Icon({ name, click = false, size = false }) {
	const { loading, SvgIcon } = useDynamicSvgImport(name);
	return (
		<>
			{loading && <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#b0b0b0" }}></div>}
			{SvgIcon && (
				<div
					style={{
						display: "flex",
						alignItems: "center",
						...(size && { width: `${size}px`, height: `${size}px` }),
					}}
					onClick={() => {
						if (click === false) return;
						click();
					}}
				>
					<SvgIcon />
				</div>
			)}
		</>
	);
}
