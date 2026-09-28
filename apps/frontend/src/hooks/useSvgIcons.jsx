import { useEffect, useMemo, useState } from "react";

export function useSvgIcons(slugs) {
	const [icons, setIcons] = useState({});
	const slugKey = useMemo(() => [...slugs].sort().join(","), [slugs]);

	useEffect(() => {
		let cancelled = false;
		const loadIcons = async () => {
			const parser = new DOMParser();
			// Load icons in parallel — sequential awaits made the PDF export race the
			// chart's d3 render (each import is a network round-trip in the renderer).
			const entries = await Promise.all(
				slugs.map(async (slug) => {
					try {
						const svgModule = await import(`../assets/icons/${slug}.svg?raw`);
						const el = parser.parseFromString(svgModule.default, "image/svg+xml").documentElement;
						return [
							slug,
							{
								content: el.innerHTML,
								viewBox: el.getAttribute("viewBox"),
								width: el.getAttribute("width"),
								height: el.getAttribute("height"),
							},
						];
					} catch (error) {
						console.warn(`Failed to load SVG: ${slug}`, error);
						return [slug, null];
					}
				})
			);
			if (!cancelled) setIcons(Object.fromEntries(entries));
		};
		if (slugs.length > 0) loadIcons();
		return () => {
			cancelled = true;
		};
	}, [slugKey]);

	return { icons, loaded: Object.keys(icons).length === slugs.length && slugs.length > 0 };
}
