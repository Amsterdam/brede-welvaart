export const isProjectIntakeComplete = (project = {}) => {
	const reasons = Array.isArray(project.reason) ? project.reason : [];

	return Boolean(
		reasons.length &&
			(!reasons.includes("OTHER") || project.reasonOther?.trim()) &&
			project.scanGoal?.trim() &&
			project.impactMotivation?.trim() &&
			project.scope?.trim()
	);
};

export const getProjectEditorPath = (project) => {
	if (project?.status === "DRAFT" && !isProjectIntakeComplete(project)) {
		return `/project/${project.slug}/intake`;
	}

	return `/project/${project.slug}`;
};
