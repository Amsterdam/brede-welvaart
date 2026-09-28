export default function getInitials(userFullName: string) {
	if (userFullName) {
		// userFullName is in the format "{last}, {first}"
		const parts = userFullName.split(",");
		if (parts.length === 2) {
			const last = parts[0]?.trim();
			const first = parts[1]?.trim();
			const firstInitial = first?.charAt(0) || "";
			const lastInitial = last?.charAt(0) || "";
			return `${firstInitial}${lastInitial}`.toUpperCase();
		} else {
			// fallback: use first two letters of the name
			return userFullName.slice(0, 2).toUpperCase();
		}
	}
	return "";
}
