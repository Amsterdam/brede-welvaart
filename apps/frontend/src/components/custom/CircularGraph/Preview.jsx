import { useEffect, useRef } from "react";
import * as d3 from "d3";

import { getCssClass } from "../../../utils/argumentValues";

const MAX_SEGMENTS = 10;
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

const Preview = ({ previewData = [] }) => {
	const svgRef = useRef();

	useEffect(() => {
		const width = 80;
		const height = 80;
		const outerRadius = 35;
		const innerRadius = 5;
		const middleCircleThickness = 0.5;
		const strokeThickness = 0;

		const colorMap = {
			green: "#00a03c",
			red: "#ec0000",
			empty: "#ffffff",
			undone: "#f6f6f6",
		};

		const svg = d3.select(svgRef.current).attr("width", width).attr("height", height);

		svg.selectAll("g").remove();

		const g = svg.append("g").attr("transform", `translate(${width / 2},${height / 2})`);

		const defs = g.append("defs");

		const createPattern = (id, fillColor) => {
			const pattern = defs
				.append("pattern")
				.attr("id", id)
				.attr("patternUnits", "userSpaceOnUse")
				.attr("width", 1)
				.attr("height", 1);

			pattern.append("rect").attr("width", 4).attr("height", 4).attr("fill", fillColor);
			pattern.append("path").attr("d", "M0,0 l4,4").attr("stroke", colorMap.empty).attr("stroke-width", 0.5);
		};

		const filter = defs
			.append("filter")
			.attr("id", "shadow")
			.attr("x", "-50%")
			.attr("y", "-50%")
			.attr("width", "200%")
			.attr("height", "200%");

		g.append("circle").attr("r", outerRadius).attr("fill", "white").attr("filter", "url(#shadow)");

		const anglePerSlice = (2 * Math.PI) / previewData.length;

		previewData.forEach((sliceData, sliceIndex) => {
			const startAngle = sliceIndex * anglePerSlice;
			const endAngle = (sliceIndex + 1) * anglePerSlice;

			const valToArgument = (val) => {
				const [sentiment, importance] = val.split(":");

				return {
					sentiment,
					importance,
				};
			};

			const items = sliceData.map(valToArgument);
			const negativeArguments = filterArgumentsBySentiment(items, "NEGATIVE");
			const positiveArguments = filterArgumentsBySentiment(items, "POSITIVE");

			const negativeArgumentsFinal = [
				...Array(MAX_SEGMENTS / 2 - negativeArguments.length).fill(""),
				...negativeArguments,
			].slice(-MAX_SEGMENTS / 2);
			const positiveArgumentsFinal = [
				...positiveArguments,
				...Array(MAX_SEGMENTS / 2 - positiveArguments.length).fill(""),
			].slice(0, MAX_SEGMENTS / 2);

			[...negativeArgumentsFinal, ...positiveArgumentsFinal].forEach((argument, iArgument) => {
				const segInnerRadius = innerRadius + (iArgument * (outerRadius - innerRadius)) / MAX_SEGMENTS;
				const segOuterRadius = innerRadius + ((iArgument + 1) * (outerRadius - innerRadius)) / MAX_SEGMENTS;

				const arc = d3
					.arc()
					.innerRadius(segInnerRadius)
					.outerRadius(segOuterRadius)
					.startAngle(startAngle)
					.endAngle(endAngle);

				g.append("path")
					.attr("d", arc())
					.attr(
						"fill",
						colorMap[getCssClass(argument)] ||
							(negativeArguments.length === 0 && positiveArguments.length === 0 && colorMap.undone) ||
							colorMap.empty
					)
					.attr("stroke", "#000")
					.attr("stroke-width", strokeThickness);
			});
		});

		const middleRadius = innerRadius + ((MAX_SEGMENTS / 2) * (outerRadius - innerRadius)) / MAX_SEGMENTS;
		g.append("circle")
			.attr("r", middleRadius)
			.attr("fill", "none")
			.attr("stroke", "black")
			.attr("stroke-width", middleCircleThickness);
	}, [previewData]);

	return (
		<div className="chart-wrapper" style={{ width: "80px", height: "80px" }}>
			<svg ref={svgRef} width={80} height={80} viewBox="0 0 80 80"></svg>
		</div>
	);
};

export default Preview;
