import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { v4 as uuidv4 } from "uuid";

import { getCssClass, getLocationIcon, getTimeIcon } from "../../../utils/argumentValues";

const MAX_ARGUMENTS_PER_SENTIMENT = 5;

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

export const SliceGraph = ({ theme }) => {
	const svgRef = useRef();

	// Pre-load all required SVG icons
	const [timeLocIcons, settimeLocIcons] = useState({});

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
		const loadAllIcons = async () => {
			const icons = {};

			const iconSlugs = [
				"clock",
				"clock-top",
				"clock-bottom",
				"clock-full",
				"location",
				"location-top",
				"location-bottom",
				"location-full",
			];

			for (const slug of iconSlugs) {
				try {
					const svgModule = await import(`../../../assets/icons/${slug}.svg?raw`);
					const parser = new DOMParser();
					const svgDoc = parser.parseFromString(svgModule.default, "image/svg+xml");
					const svgElement = svgDoc.documentElement;

					icons[slug] = {
						content: svgElement.innerHTML,
						viewBox: svgElement.getAttribute("viewBox"),
						width: slug.includes("clock") ? 80 : 70,
						height: slug.includes("clock") ? 80 : 70,
					};
				} catch (error) {
					console.warn(`Failed to load SVG: ${slug}`, error);
					icons[slug] = null;
				}
			}

			settimeLocIcons(icons);
		};

		loadAllIcons();
	}, [theme]);

	useEffect(() => {
		if (Object.keys(timeLocIcons).length !== 8) return;
		const width = 550;
		const height = 320;
		const radius = 500;
		const innerRadius = 40;
		const numSlices = 10;
		const stripedGreenId = `stripedGreen-${uuidv4()}`; // random id needed for multiple svg's defs
		const stripedRedId = `stripedRed-${uuidv4()}`; // random id needed for multiple svg's defs

		const colorMap = {
			green: "#00a03c",
			red: "#ec0000",
			"striped-green": `url(#${stripedGreenId})`,
			"striped-red": `url(#${stripedRedId})`,
			empty: "#ffffff",
			undone: "#f6f6f6",
		};

		// Clear previous render
		const svgRoot = d3.select(svgRef.current).attr("width", width).attr("height", height);
		svgRoot.selectAll("*").remove();

		// Add <defs> directly to the <svg> (not the <g>)
		const defs = svgRoot.append("defs");

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

		const g = svgRoot.append("g").attr("transform", `translate(0, ${height})`);

		const arc = d3
			.arc()
			.startAngle(Math.PI * 0.3)
			.endAngle(Math.PI / 2); // First 90 degrees

		const step = (radius - innerRadius) / numSlices;

		// get negative / positive arguments with defensive filtering
		const negativeArguments = filterArgumentsBySentiment(theme.arguments, "NEGATIVE");
		const positiveArguments = filterArgumentsBySentiment(theme.arguments, "POSITIVE");

		// order based on discussionPoint
		// const negativeArgumentsOrdered = _.orderBy(negativeArguments, ["discussionPoint"], "asc");
		// const positiveArgumentsOrdered = _.orderBy(positiveArguments, ["discussionPoint"], "desc");

		// make it numSlices / 2 total
		const negativeArgumentsFinal = [
			...Array(numSlices / 2 - negativeArguments.length).fill(""),
			...negativeArguments,
		].slice(-numSlices / 2);
		const positiveArgumentsFinal = [
			...positiveArguments,
			...Array(numSlices / 2 - positiveArguments.length).fill(""),
		].slice(0, numSlices / 2);

		const arcData = [...negativeArgumentsFinal, ...positiveArgumentsFinal].map((argument, argumentIndex) => {
			const inner = innerRadius + argumentIndex * step;
			const outer = innerRadius + (argumentIndex + 1) * step;
			const color =
				colorMap[getCssClass(argument)] ||
				(negativeArguments.length === 0 && positiveArguments.length === 0 && colorMap.undone) ||
				colorMap.empty;
			return { inner, outer, color };
		});

		arcData.forEach((d) => {
			g.append("path")
				.attr(
					"d",
					arc({
						innerRadius: d.inner,
						outerRadius: d.outer,
					})
				)
				.attr("fill", d.color)
				.attr("stroke", "black")
				.attr("stroke-width", 1);
		});

		// time & location icons
		const outerRadius = radius;
		const timeIconX = outerRadius * Math.cos(-0.4);
		const timeIconY = outerRadius * Math.sin(-0.4);
		const locationIconX = outerRadius * Math.cos(-0.2);
		const locationIconY = outerRadius * Math.sin(-0.2);
		const rotationDegTime = (-0.4 * 180) / Math.PI + 90;
		const rotationDegLocation = (-0.2 * 180) / Math.PI + 90;
		const allUsedTimes = [...new Set(theme.arguments.flatMap((arg) => arg.timeFrame))];
		const allUsedLocations = [...new Set(theme.arguments.flatMap((arg) => arg.location))];
		const svgGroup2 = g
			.append("g")
			.attr(
				"transform",
				`translate(${timeIconX - 50}, ${timeIconY - 35}) rotate(${rotationDegTime}, ${40}, ${40}) scale(0.7)`
			);
		const svgGroup3 = g
			.append("g")
			.attr(
				"transform",
				`translate(${locationIconX - 40}, ${locationIconY - 30}) rotate(${rotationDegLocation}, ${35}, ${35}) scale(0.8)`
			);
		const timeIconData = timeLocIcons[getTimeIcon(allUsedTimes)];
		const locationIconData = timeLocIcons[getLocationIcon(allUsedLocations)];
		timeIconData && timeIconData.content ? svgGroup2.html(timeIconData.content) : fallbackCircle(svgGroup2);
		locationIconData && locationIconData.content
			? svgGroup3.html(locationIconData.content)
			: fallbackCircle(svgGroup3);

		// middle line
		const midSliceIndex = numSlices / 2;
		const inner = innerRadius + midSliceIndex * step;
		const outer = inner + 8;
		g.append("path")
			.attr(
				"d",
				arc({
					innerRadius: inner,
					outerRadius: outer,
				})
			)
			.attr("fill", "black");
	}, [timeLocIcons]);

	return (
		<div className="slice-chart-wrapper">
			<svg ref={svgRef}></svg>
		</div>
	);
};
