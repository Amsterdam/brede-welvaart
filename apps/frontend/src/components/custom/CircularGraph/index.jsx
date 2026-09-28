import { useEffect, useId, useMemo, useRef } from "react";
import * as d3 from "d3";
import _ from "lodash";

import { getCssClass, getLocationIcon, getTimeIcon } from "../../../utils/argumentValues";
import { useSvgIcons } from "../../../hooks/useSvgIcons";

const MAX_SEGMENTS = 10;
const MAX_ARGUMENTS_PER_SENTIMENT = 5;

const TIME_LOC_SLUGS = [
	"clock",
	"clock-top",
	"clock-bottom",
	"clock-full",
	"location",
	"location-top",
	"location-bottom",
	"location-full",
];

// Helper function to safely filter arguments to prevent graph crashes
const filterArgumentsBySentiment = (args, sentiment) => {
	return args
		.filter((a) => a.sentiment === sentiment)
		.sort((a, b) => {
			// Prioritize HIGH importance arguments
			if (a.importance === "HIGH" && b.importance !== "HIGH") return -1;
			if (b.importance === "HIGH" && a.importance !== "HIGH") return 1;
			return 0;
		})
		.slice(0, MAX_ARGUMENTS_PER_SENTIMENT); // Take only first 5 to prevent crashes
};

export const CircularGraph = ({ themes }) => {
	const svgRef = useRef();
	const resourcePrefix = `circular-graph-${useId().replace(/:/g, "")}`;

	const iconSlugs = useMemo(() => themes.map((t) => t.slug), [themes]);
	const { icons: loadedIcons, loaded: themeIconsLoaded } = useSvgIcons(iconSlugs);
	const { icons: timeLocIcons, loaded: timeLocLoaded } = useSvgIcons(TIME_LOC_SLUGS);

	const fallbackCircle = (svg) => {
		svg.append("circle")
			.attr("cx", 35)
			.attr("cy", 35)
			.attr("r", 30)
			.attr("fill", "#ccc")
			.attr("stroke", "#999")
			.attr("stroke-width", 2);
		return;
	};

	useEffect(() => {
		// Wait for icons to load before rendering
		if (!themeIconsLoaded || !timeLocLoaded) return;
		const width = 1872;
		const height = 1872;
		const outerRadius = 600;
		const innerRadius = 70;

		const stripedGreenId = `${resourcePrefix}-striped-green`;
		const stripedRedId = `${resourcePrefix}-striped-red`;
		const shadowId = `${resourcePrefix}-shadow`;
		const colorMap = {
			green: "#00a03c",
			red: "#ec0000",
			"striped-green": `url(#${stripedGreenId})`,
			"striped-red": `url(#${stripedRedId})`,
			empty: "#ffffff",
			undone: "#f6f6f6",
		};

		const svg = d3.select(svgRef.current).attr("width", width).attr("height", height);

		svg.selectAll("*").remove();

		const defs = svg.append("defs");
		const g = svg.append("g").attr("transform", `translate(${width / 2},${height / 2})`);

		const createPattern = (id, fillColor) => {
			const pattern = defs
				.append("pattern")
				.attr("id", id)
				.attr("patternUnits", "userSpaceOnUse")
				.attr("width", 40)
				.attr("height", 40);
			pattern
				.append("path")
				.attr("d", "M0 40L40 0H20L0 20M40 40V20L20 40")
				.attr("fill", fillColor)
				.attr("fill-opacity", 0.7)
				.attr("fill-rule", "evenodd");
		};

		createPattern(stripedGreenId, colorMap.green);
		createPattern(stripedRedId, colorMap.red);

		const filter = defs
			.append("filter")
			.attr("id", shadowId)
			.attr("x", "-50%")
			.attr("y", "-50%")
			.attr("width", "200%")
			.attr("height", "200%");

		filter
			.append("feDropShadow")
			.attr("dx", "0")
			.attr("dy", "0")
			.attr("stdDeviation", "10")
			.attr("flood-color", "#000")
			.attr("flood-opacity", "0.03");

		g.append("circle")
			.attr("r", outerRadius)
			.attr("fill", "white")
			.attr("filter", `url(#${shadowId})`);

		const anglePerSlice = (2 * Math.PI) / themes.length;

		// data to graph
		themes.forEach((sliceData, sliceIndex) => {
			const startAngle = sliceIndex * anglePerSlice;
			const endAngle = (sliceIndex + 1) * anglePerSlice;

			// get negative / positive arguments with defensive filtering
			const negativeArguments = filterArgumentsBySentiment(sliceData.arguments, "NEGATIVE");
			const positiveArguments = filterArgumentsBySentiment(sliceData.arguments, "POSITIVE");

			// order based on discussionPoint
			// const negativeArgumentsOrdered = _.orderBy(negativeArguments, ["discussionPoint"], "asc");
			// const positiveArgumentsOrdered = _.orderBy(positiveArguments, ["discussionPoint"], "desc");

			// make it MAX_SEGMENTS / 2 total
			const negativeArgumentsFinal = [
				...Array(MAX_SEGMENTS / 2 - negativeArguments.length).fill(""),
				...negativeArguments,
			].slice(-MAX_SEGMENTS / 2);
			const positiveArgumentsFinal = [
				...positiveArguments,
				...Array(MAX_SEGMENTS / 2 - positiveArguments.length).fill(""),
			].slice(0, MAX_SEGMENTS / 2);

			// data theme arguments
			[...negativeArgumentsFinal, ...positiveArgumentsFinal].forEach((argument, iArgument) => {
				const segInnerRadius = innerRadius + (iArgument * (outerRadius - innerRadius)) / MAX_SEGMENTS;
				const segOuterRadius = innerRadius + ((iArgument + 1) * (outerRadius - innerRadius)) / MAX_SEGMENTS;

				const arc = d3
					.arc()
					.innerRadius(segInnerRadius)
					.outerRadius(segOuterRadius)
					.startAngle(startAngle)
					.endAngle(endAngle);

				// negativeArguments & positiveArguments give the amount of neg/pos agruments in 1 theme
				// if both are empty array's, it means the theme can be grayed out
				g.append("path")
					.attr("d", arc())
					.attr(
						"fill",
						colorMap[getCssClass(argument)] ||
							(negativeArguments.length === 0 && positiveArguments.length === 0 && colorMap.undone) ||
							colorMap.empty
					)
					.attr("stroke", "#000")
					.attr("stroke-width", 0.5);
			});

			// icons
			const iconRadius = outerRadius + 180;
			const labelRadius = outerRadius + 90;
			const midAngle = startAngle + anglePerSlice;
			const iconX = Math.cos(midAngle - anglePerSlice * 3) * iconRadius;
			const iconY = Math.sin(midAngle - anglePerSlice * 3) * iconRadius;
			const svgGroup = g.append("g").attr("transform", `translate(${iconX - 35}, ${iconY - 35})`);
			const iconData = loadedIcons[sliceData.slug];
			if (iconData && iconData.content) {
				// Set the SVG content in the group
				svgGroup.html(iconData.content);
				// Scale the SVG to fit our desired size (70x70)
				if (iconData.viewBox) {
					const [, , width, height] = iconData.viewBox.split(" ").map(Number);
					const scaleX = 70 / width;
					const scaleY = 70 / height;
					const scale = Math.min(scaleX, scaleY);
					svgGroup.attr("transform", `translate(${iconX - 35}, ${iconY - 35}) scale(${scale})`);
				} else if (iconData.width && iconData.height) {
					const scaleX = 70 / parseFloat(iconData.width);
					const scaleY = 70 / parseFloat(iconData.height);
					const scale = Math.min(scaleX, scaleY);
					svgGroup.attr("transform", `translate(${iconX - 35}, ${iconY - 35}) scale(${scale})`);
				} else {
					// Fallback scaling if no dimensions available
					svgGroup.attr("transform", `translate(${iconX - 35}, ${iconY - 35}) scale(0.5)`);
				}
			} else {
				// Fallback: create a placeholder circle
				fallbackCircle(svgGroup);
			}

			// time & location icons
			const timeIconX = Math.cos(midAngle - anglePerSlice * 3 * 1.05) * outerRadius;
			const timeIconY = Math.sin(midAngle - anglePerSlice * 3 * 1.05) * outerRadius;
			const locationIconX = Math.cos(midAngle - anglePerSlice * 3 * 0.95) * outerRadius;
			const locationIconY = Math.sin(midAngle - anglePerSlice * 3 * 0.95) * outerRadius;
			const rotationDeg = ((startAngle + anglePerSlice / 2) * 180) / Math.PI;
			const scaleTimeIcon = 0.7;
			const scaleLocationIcon = 0.9;
			const allUsedTimes = [...new Set(sliceData.arguments.flatMap((arg) => arg.timeFrame))];
			const allUsedLocations = [...new Set(sliceData.arguments.flatMap((arg) => arg.location))];
			const svgGroup2 = g.append("g").attr(
				"transform",
				`
					translate(${timeIconX - 40}, ${timeIconY - 40})
					translate(${40 * (1 - scaleTimeIcon)}, ${40 * (1 - scaleTimeIcon)})
    				scale(${scaleTimeIcon})
    				rotate(${rotationDeg}, ${40}, ${40})
					`
			);
			const svgGroup3 = g.append("g").attr(
				"transform",
				`
					translate(${locationIconX - 35}, ${locationIconY - 35})
					translate(${35 * (1 - scaleLocationIcon)}, ${35 * (1 - scaleLocationIcon)})
    				scale(${scaleLocationIcon})
    				rotate(${rotationDeg}, ${35}, ${35})
				`
			);
			const timeIconData = timeLocIcons[getTimeIcon(allUsedTimes)];
			const locationIconData = timeLocIcons[getLocationIcon(allUsedLocations)];
			timeIconData && timeIconData.content ? svgGroup2.html(timeIconData.content) : fallbackCircle(svgGroup2);
			locationIconData && locationIconData.content
				? svgGroup3.html(locationIconData.content)
				: fallbackCircle(svgGroup3);

			// labels
			const pathId = `${resourcePrefix}-label-path-${sliceIndex}`;
			const isBottomHalf = startAngle > Math.PI / 2 && startAngle < (2.8 * Math.PI) / 2;
			const labelArc = d3
				.arc()
				.innerRadius(outerRadius)
				.outerRadius(labelRadius)
				.startAngle(isBottomHalf ? endAngle : startAngle)
				.endAngle(isBottomHalf ? startAngle : endAngle);
			defs.append("path").attr("id", pathId).attr("d", labelArc()).attr("fill", "none");
			g.append("text")
				.append("textPath")
				.attr("href", `#${pathId}`)
				.attr("startOffset", "22%")
				.attr("text-anchor", "middle")
				.style("font-size", "36px")
				.style("font-weight", "700")
				.style("font-family", "sans-serif")
				.text(sliceData.name)
				.call(wrap, 410);

			// function to wrap the text in multiple lines
			function wrap(text, width) {
				text.each(function () {
					const text = d3.select(this);
					const words = text.text().split(/\s+/).reverse();
					let word;
					let line = [];
					let lineNumber = 0;
					const lineHeight = 1.1; // in em
					const x = text.attr("x") || 0;
					const y = text.attr("y") || 0;

					text.text(null);

					let tspan = text.append("tspan").attr("x", x).attr("y", y).attr("dy", "0em").text("");

					while ((word = words.pop())) {
						line.push(word);
						tspan.text(line.join(" "));
						if (tspan.node().getComputedTextLength() > width) {
							line.pop();
							tspan.text(line.join(" "));
							line = [word];
							lineNumber++;
							tspan = text
								.append("tspan")
								.attr("x", x)
								.attr("y", y)
								.attr("dy", `${lineHeight}em`) // Set relative spacing
								.text(word);
						}
					}

					// Fix vertical centering
					const tspans = text.selectAll("tspan").nodes();

					tspans.forEach((t, i) => {
						d3.select(t).attr("dy", `${i * lineHeight}em`);
					});
				});
			}
		});

		// middle line
		const middleRadius = innerRadius + ((MAX_SEGMENTS / 2) * (outerRadius - innerRadius)) / MAX_SEGMENTS;
		g.append("circle")
			.attr("r", middleRadius)
			.attr("fill", "none")
			.attr("stroke", "black")
			.attr("stroke-width", 16);
	}, [themes, loadedIcons, timeLocIcons, resourcePrefix]);

	return (
		// Reserve the chart's full box up-front. d3 only sizes the SVG once async
		// icons have loaded; without intrinsic dimensions the wrapper collapses to ~0
		// until then, and the front page's negative-margin legend/key-message overlap
		// the heading (visible in PDF export, where capture can race the icon load).
		<div className="chart-wrapper">
			<svg ref={svgRef} width={1872} height={1872} viewBox="0 0 1872 1872"></svg>
		</div>
	);
};
