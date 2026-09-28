import "./index.scss";

export default function ChipMultiSelect({ click = () => {}, selected = false, text }) {
	return (
		<div className={`chip-multi-select ${selected && "chip-multi-select-selected"}`} onClick={click}>
			<span>{text}</span>
		</div>
	);
}
