import React, { useEffect, useState } from "react";

export function useDynamicSvgImport(iconName) {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);
	const [SvgIcon, setSvgIcon] = useState(null);

	useEffect(() => {
		setLoading(true);

		const importSvgIcon = async () => {
			try {
				const iconModule = await import(`../assets/icons/${iconName}.svg?react`);
				setSvgIcon(() => iconModule.default);
			} catch (err) {
				setError(err);
				console.error(err);
			} finally {
				setLoading(false);
			}
		};

		importSvgIcon();
	}, [iconName]);

	return { error, loading, SvgIcon };
}
