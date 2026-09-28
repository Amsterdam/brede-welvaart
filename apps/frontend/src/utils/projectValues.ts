import { ProjectStatus } from "@shared/types";

export const getStatusIcon = (status: any): string => {
	switch (status) {
		case ProjectStatus.Archived:
			return "projectstatus-archived";
		case ProjectStatus.Draft:
			return "projectstatus-draft";
		default:
			return "projectstatus-published";
	}
};

export const getStatusOption = (status: any): string => {
	switch (status) {
		case ProjectStatus.Archived:
			return "Gearchiveerd";
		case ProjectStatus.Draft:
			return "In uitvoering";
		default:
			return "Ingediend";
	}
};
