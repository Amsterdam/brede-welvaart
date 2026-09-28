import Icon from "../../../common/Icon";

import "./index.scss";

export default function TextWithMention({ text }) {
	const parts = text.split(/(\#[a-zA-Z0-9_-]+)/g);

	return (
		<span>
			{parts.map((part, index) => {
				if (/^\#[a-zA-Z0-9_-]+$/.test(part)) {
					const partNoHashtag = part.replace("#", "");
					const partCleanText = partNoHashtag.replaceAll("-", " ");
					return (
						<div className={`mention bg-theme-${partNoHashtag}`} key={index}>
							<Icon name={`${partNoHashtag}-straight`} size={18} />
							<span>{partCleanText}</span>
						</div>
					);
				}
				return <span key={index}>{part}</span>;
			})}
		</span>
	);
}
