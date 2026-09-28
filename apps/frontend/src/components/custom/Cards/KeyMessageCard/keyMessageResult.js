export const readGeneratedKeyMessage = (data) => {
	const value = data?.generateProjectKeyMessage;
	if (typeof value !== "string" || !value.trim()) {
		throw new Error("De AI-service gaf geen kernboodschap terug.");
	}
	return value;
};
