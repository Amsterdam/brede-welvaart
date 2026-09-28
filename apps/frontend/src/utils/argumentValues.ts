import { IArgument, ArgumentTimeFrame, ArgumentLocation, ArgumentSentiment, ArgumentSourceType } from "@shared/types";

export const getCssClass = (argument: IArgument): string => {
	const striped = argument.discussionPoint
		? argument.sentiment === ArgumentSentiment.Neutral
			? ""
			: "striped-"
		: "";
	const color =
		argument.sentiment === ArgumentSentiment.Positive
			? "green"
			: argument.sentiment === ArgumentSentiment.Negative
				? "red"
				: "blue";
	return `${striped}${color}`;
};

export const getSentimentOption = (sentiment: any): string => {
	switch (sentiment) {
		case ArgumentSentiment.Negative:
			return "Negatief";
		case ArgumentSentiment.Neutral:
			return "Neutraal";
		default:
			return "Positief";
	}
};

export const getSourceTypeOption = (sourceType: any): string => {
	switch (sourceType) {
		case ArgumentSourceType.Expert:
			return "Expert";
		case ArgumentSourceType.Data:
			return "Data";
		case ArgumentSourceType.Policy:
			return "Beleid";
		case ArgumentSourceType.Resident:
			return "Bewoner";
		default:
			return "Link";
	}
};

export const getTimeOption = (time: any): string => {
	switch (time) {
		case ArgumentTimeFrame.Now:
			return "Nu";
		case ArgumentTimeFrame.OneToFiveY:
			return "1-5 jaar";
		case ArgumentTimeFrame.FiveToTenY:
			return "5-10 jaar";
		case ArgumentTimeFrame.TenToTwentyY:
			return "10-20 jaar";
		case ArgumentTimeFrame.TwentyToFortyY:
			return "20-40 jaar";
		default:
			return ">40 jaar";
	}
};

export const getLocationOption = (location: any): string => {
	switch (location) {
		case ArgumentLocation.Street:
			return "Straat";
		case ArgumentLocation.Neighborhood:
			return "Buurt/Wijk";
		case ArgumentLocation.City:
			return "Stad";
		case ArgumentLocation.Province:
			return "Provincie/Regio";
		case ArgumentLocation.InsideEu:
			return "Binnen EU";
		default:
			return "Buiten EU";
	}
};

export const timeOptions = {
	short: [ArgumentTimeFrame.Now, ArgumentTimeFrame.OneToFiveY, ArgumentTimeFrame.FiveToTenY] as const,
	long: [ArgumentTimeFrame.TenToTwentyY, ArgumentTimeFrame.TwentyToFortyY, ArgumentTimeFrame.FortyPlusY] as const,
};

export const locationOptions = {
	inside: [ArgumentLocation.Street, ArgumentLocation.Neighborhood, ArgumentLocation.City] as const,
	outside: [ArgumentLocation.Province, ArgumentLocation.InsideEu, ArgumentLocation.OutsideEu] as const,
};

export const getTimeIcon = (selectedTimeFrames: any): string => {
	let hasShort = false;
	let hasLong = false;
	selectedTimeFrames.forEach((tf: any) => {
		if (hasShort && hasLong) return;
		const isShort = timeOptions.short.includes(tf);
		if (isShort) {
			hasShort = true;
		} else {
			hasLong = true;
		}
	});
	if (hasShort && hasLong) return "clock-full";
	if (hasShort) return "clock-bottom";
	if (hasLong) return "clock-top";
	return "clock";
};

export const getLocationIcon = (selectedLocations: any): string => {
	let hasInside = false;
	let hasOutside = false;
	selectedLocations.forEach((loc: any) => {
		if (hasInside && hasOutside) return;
		const isInside = locationOptions.inside.includes(loc);
		if (isInside) {
			hasInside = true;
		} else {
			hasOutside = true;
		}
	});
	if (hasInside && hasOutside) return "location-full";
	if (hasInside) return "location-bottom";
	if (hasOutside) return "location-top";
	return "location";
};

export const getSentimentIcon = (sentiment: ArgumentSentiment, selected = false, overViewPage = false): string => {
	if (overViewPage) {
		if (sentiment === ArgumentSentiment.Positive) return "overview-legend-positive";
		if (sentiment === ArgumentSentiment.Neutral) return "overview-legend-neutral";
		if (sentiment === ArgumentSentiment.Negative) return "overview-legend-negative";
		return "";
	}
	if (selected) {
		if (sentiment === ArgumentSentiment.Positive) return "plus-white";
		if (sentiment === ArgumentSentiment.Neutral) return "neutral-white";
		if (sentiment === ArgumentSentiment.Negative) return "minus-white";
		return "";
	}
	if (sentiment === ArgumentSentiment.Positive) return "plus";
	if (sentiment === ArgumentSentiment.Neutral) return "neutral";
	if (sentiment === ArgumentSentiment.Negative) return "minus";
	return "";
};

export const getSourceTypeIcon = (sourceType: ArgumentSourceType, selected = false, preview = false): string => {
	if (preview) {
		if (sourceType === "DATA") return "source-data-blue";
		if (sourceType === "EXPERT") return "source-expert-blue";
		if (sourceType === "POLICY") return "source-policy-blue";
		if (sourceType === "RESIDENT") return "source-resident-blue";
		return "";
	}
	if (selected) {
		if (sourceType === "DATA") return "source-data-white";
		if (sourceType === "EXPERT") return "source-expert-white";
		if (sourceType === "POLICY") return "source-policy-white";
		if (sourceType === "RESIDENT") return "source-resident-white";
		return "";
	}
	if (sourceType === "DATA") return "source-data";
	if (sourceType === "EXPERT") return "source-expert";
	if (sourceType === "POLICY") return "source-policy";
	if (sourceType === "RESIDENT") return "source-resident";
	return "";
};
