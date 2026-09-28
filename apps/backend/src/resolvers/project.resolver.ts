import type {
  AppContext,
  IProject,
  ITheme,
  Project,
  ProjectResolvers,
  Theme,
  User as UserType,
  Resolver,
  ProjectUser,
  Argument,
} from "@shared/types";
import { ProjectTemplate } from "@shared/types";

interface ExtendedProjectResolvers extends ProjectResolvers<AppContext> {
  permissibleActions: Resolver<string[], Project, AppContext>;
  previewData: Resolver<string[][] | [], Project, AppContext>;
}
import { User } from "../models/User";
import { mapMongoToGraphQL } from "../lib/mongoMapper";
import { getPermissibleActions } from "../lib/permissions";
import { isUserAssignedToProject } from "../lib/permissions";

export const projectResolver: ExtendedProjectResolvers = {
  createdBy: async (project: Project) => {
    if (!project.createdBy) {
      return null;
    }

    const user = await User.findById(project.createdBy).lean();

    return mapMongoToGraphQL<UserType>(user);
  },

  shareLink: async (
    project: Project,
    _args: unknown,
    context: AppContext
  ): Promise<string | null> => {
    if (
      context.user &&
      (await isUserAssignedToProject(
        project.id?.toString() || "",
        context.user._id?.toString() || context.user.id?.toString() || "",
        "OWNER"
      ))
    ) {
      return project.shareLink || null;
    }
    return null;
  },

  // Scans created before the template field existed have no stored value.
  // Hydrated reads get the Mongoose default, but lean/aggregate reads don't,
  // so fall back here to keep the non-null GraphQL field safe for old scans.
  template: (project: Project) => project.template ?? ProjectTemplate.Default,

  themes: (project: Project) => {
    if (!project.themes) {
      return [];
    }

    return project.themes.map((theme) => ({
      ...theme,
      projectSlug: project.slug,
    })) as Theme[];
  },
  uploadedDocuments: (project: Project) => {
    return project.uploadedDocuments ?? [];
  },
  // Guards the non-null fields of AiDraftEffect against malformed legacy records.
  // themeSlug is deliberately absent: drafts are project-level (themeless) and only
  // get a theme when converted into an argument.
  aiDraftEffects: (project: Project) => {
    return (project.aiDraftEffects ?? []).filter((draft) =>
      Boolean(
        draft?.id &&
        draft.title &&
        draft.explanation &&
        draft.sentiment &&
        Array.isArray(draft.timeFrame) &&
        Array.isArray(draft.location) &&
        draft.source?.type &&
        draft.sourceEffect?.key &&
        draft.sourceEffect.sourceKind &&
        draft.sourceEffect.sourceId &&
        draft.sourceEffect.effectId &&
        typeof draft.generatedByAi === "boolean" &&
        draft.importance &&
        draft.createdAt &&
        draft.updatedAt
      )
    );
  },
  permissibleActions: (
    parent: Project,
    _args: {},
    context: AppContext
  ): Promise<string[]> => {
    const userId =
      context.user?._id?.toString() || context.user?.id?.toString();
    if (!userId) return Promise.resolve([]);

    const projectData: IProject = {
      name: parent.name,
      description: parent.description,
      reason: parent.reason || [],
      reasonOther: parent.reasonOther || undefined,
      scanGoal: parent.scanGoal || undefined,
      impactSituation: parent.impactSituation || undefined,
      impactMotivation: parent.impactMotivation || undefined,
      scope: parent.scope || undefined,
      additionalContext: parent.additionalContext || undefined,
      status: parent.status,
      createdBy: parent.createdBy?.id || "",
      themes:
        parent.themes
          ?.filter((t): t is Theme => !!t)
          .map(
            (t: Theme) =>
              ({
                ...t,
                arguments: t.arguments?.filter((a): a is Argument => !!a) || [],
              } as ITheme)
          ) || [],
      users:
        parent.users
          ?.filter((u): u is ProjectUser => !!u)
          .map((u: ProjectUser) => ({
            user: u.user.id,
            role: u.role,
            createdAt: u.createdAt as Date,
            updatedAt: u.updatedAt as Date,
          })) || [],
      createdAt: parent.createdAt as Date,
      updatedAt: parent.updatedAt as Date,
      shareLink: parent.shareLink || undefined,
      keyMessage: parent.keyMessage || "",
    };

    return Promise.resolve(getPermissibleActions(projectData, userId));
  },
  previewData: (
    parent: Project,
    _args: {},
    context: AppContext
  ): string[][] | [] => {
    if (parent && parent.themes) {
      return parent?.themes.map(
        (t) =>
          (t &&
            t.arguments &&
            t.arguments
              .map(
                (a) =>
                  (a &&
                    a.sentiment &&
                    a.importance &&
                    `${a?.sentiment}:${a.importance}` as string) ||
                  ""
              )
              .filter((a) => a != undefined)) ||
          []
      );
    }

    return [];
  },
};

export const projectUploadedDocumentResolver = {
  analysisStatus: (document: any) => document.analysisStatus ?? 'COMPLETED',
  aiStatements: (document: any) => document.aiStatements ?? [],
};
