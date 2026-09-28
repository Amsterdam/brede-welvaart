/**
 * Utility functions for calculating content height and pagination
 */

// A4 page dimensions in pixels (at standard 96 DPI)
export const PAGE_DIMENSIONS = {
	width: 2480,
	height: 3508, // A4 height in pixels
};

// Configuration for pagination calculations
export const PAGINATION_CONFIG = {
	heightBuffer: 0.85, // Use 85% of available height to account for estimation errors
	charactersPerLine: {
		title: 50, // Characters per line for argument titles
		explanation: 70, // Characters per line for explanations
		description: 65, // Characters per line for theme descriptions
	},
};

// Fixed heights based on CSS (from index.scss)
export const LAYOUT_HEIGHTS = {
	pageHeader: 24 + 74 + 32 + 32, // border-top + img height + padding top/bottom
	pageFooter: 64 + 32 + 32, // estimated based on padding
	pageContentPadding: 60 * 2, // padding top/bottom for content
	pageBorder: 4 * 2, // border thickness top/bottom
	pageContentMargin: 80 * 2, // margin left/right doesn't affect height but content area
};

// Estimated heights for different content types
export const CONTENT_HEIGHTS = {
	themeHeader: {
		paddingBottom: 50, // padding-bottom for theme header
		iconHeight: 52, // svg height
		titleGap: 24, // gap between icon and title
		titleDescriptionGap: 44, // gap between title and description
		estimatedTitleHeight: 60, // estimated h2 height
		descriptionLineHeight: 54, // line-height for description
	},
	argument: {
		border: 4, // border thickness
		padding: 32 * 2, // padding top/bottom
		titleLineHeight: 57, // line-height for title (38px font)
		explanationLineHeight: 54, // line-height for explanation (36px font)
		tlSectionPadding: 24 * 2, // padding top/bottom for time/location section
		tlSectionHeight: 80, // estimated height of time/location section
		gap: 24, // gap between arguments
	},
};

/**
 * Calculate available content height for a theme page
 */
export const getAvailableContentHeight = () => {
	const { pageHeader, pageFooter, pageContentPadding, pageBorder } = LAYOUT_HEIGHTS;

	return PAGE_DIMENSIONS.height - pageHeader - pageFooter - pageContentPadding - pageBorder;
};

/**
 * Estimate the height of theme header content
 */
export const estimateThemeHeaderHeight = (theme) => {
	const { paddingBottom, iconHeight, titleGap, titleDescriptionGap, estimatedTitleHeight, descriptionLineHeight } =
		CONTENT_HEIGHTS.themeHeader;

	// Estimate number of lines for description
	const descriptionLines = Math.ceil(
		(theme.description || "").length / PAGINATION_CONFIG.charactersPerLine.description
	);

	return (
		paddingBottom +
		iconHeight +
		titleGap +
		estimatedTitleHeight +
		titleDescriptionGap +
		descriptionLines * descriptionLineHeight
	);
};

/**
 * Estimate the height of a single argument
 */
export const estimateArgumentHeight = (argument) => {
	const { border, padding, titleLineHeight, explanationLineHeight, tlSectionPadding, tlSectionHeight, gap } =
		CONTENT_HEIGHTS.argument;

	// Estimate number of lines for title and explanation
	const titleLines = Math.ceil(argument.title.length / PAGINATION_CONFIG.charactersPerLine.title);
	const explanationLines = Math.ceil(argument.explanation.length / PAGINATION_CONFIG.charactersPerLine.explanation);

	return (
		border +
		padding +
		titleLines * titleLineHeight +
		explanationLines * explanationLineHeight +
		tlSectionPadding +
		tlSectionHeight +
		gap
	);
};

/**
 * Calculate how many arguments fit on a page
 */
export const calculateArgumentsPerPage = (theme) => {
	const availableHeight = getAvailableContentHeight();
	const themeHeaderHeight = estimateThemeHeaderHeight(theme);
	const rawRemainingHeight = availableHeight - themeHeaderHeight;
	const remainingHeight = rawRemainingHeight * PAGINATION_CONFIG.heightBuffer;

	let totalHeight = 0;
	let argumentCount = 0;

	for (const argument of theme.arguments) {
		const argumentHeight = estimateArgumentHeight(argument);

		if (totalHeight + argumentHeight <= remainingHeight) {
			totalHeight += argumentHeight;
			argumentCount++;
		} else {
			break;
		}
	}

	return argumentCount;
};

const SENTIMENT_ORDER = { POSITIVE: 0, NEGATIVE: 1, NEUTRAL: 2 };

/**
 * Sort arguments by sentiment: Positive → Negative → Neutral
 */
const sortArgumentsBySentiment = (args) =>
	[...args].sort((a, b) => (SENTIMENT_ORDER[a.sentiment] ?? 3) - (SENTIMENT_ORDER[b.sentiment] ?? 3));

/**
 * Split theme arguments into pages based on estimated heights
 */
export const paginateThemeArguments = (theme) => {
	const sortedTheme = { ...theme, arguments: sortArgumentsBySentiment(theme.arguments) };
	const pages = [];
	const argumentsPerFirstPage = calculateArgumentsPerPage(sortedTheme);

	// First page includes theme header
	if (argumentsPerFirstPage > 0) {
		pages.push({
			...sortedTheme,
			arguments: sortedTheme.arguments.slice(0, argumentsPerFirstPage),
			isFirstPage: true,
			pageNumber: 1,
		});
	}

	// Subsequent pages (without theme header, more space available)
	let remainingArguments = sortedTheme.arguments.slice(argumentsPerFirstPage);
	let pageNumber = 2;

	while (remainingArguments.length > 0) {
		const availableHeight = getAvailableContentHeight() * PAGINATION_CONFIG.heightBuffer; // Full height available for subsequent pages
		let totalHeight = 0;
		let argumentCount = 0;

		for (const argument of remainingArguments) {
			const argumentHeight = estimateArgumentHeight(argument);

			if (totalHeight + argumentHeight <= availableHeight) {
				totalHeight += argumentHeight;
				argumentCount++;
			} else {
				break;
			}
		}

		if (argumentCount === 0) {
			// If even a single argument doesn't fit, we need to split the argument itself
			argumentCount = 1; // Force at least one argument per page
		}

		pages.push({
			...sortedTheme,
			arguments: remainingArguments.slice(0, argumentCount),
			isFirstPage: false,
			pageNumber,
			continuedTheme: true,
		});

		remainingArguments = remainingArguments.slice(argumentCount);
		pageNumber++;
	}

	return pages;
};

/**
 * Calculate total pages needed for all themes
 */
export const calculateTotalPages = (themes) => {
	let totalPages = 3; // Cover page + circular graph page + overview page

	themes.forEach((theme) => {
		const themePages = paginateThemeArguments(theme);
		totalPages += themePages.length;
	});

	return totalPages;
};

/**
 * Generate all paginated themes for rendering
 */
export const generatePaginatedThemes = (themes) => {
	const paginatedThemes = [];

	themes.forEach((theme) => {
		const themePages = paginateThemeArguments(theme);
		paginatedThemes.push(...themePages);
	});

	return paginatedThemes;
};
