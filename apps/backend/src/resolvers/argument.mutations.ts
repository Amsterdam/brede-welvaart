import { Project } from "../models/Project";
import {
  AuthenticationError,
  NotFoundError,
  handleMongoError,
} from "../lib/errors";
import mongoose from "mongoose";
import {
  IArgument,
} from "@shared/types";
import {
  Argument as ArgumentType,
  ArgumentImportance,
  ArgumentSentiment,
  MutationCreateArgumentArgs,
  ArgumentTimeFrame,
  ArgumentLocation,
  MutationUpdateArgumentArgs,
  MutationDeleteArgumentsArgs,
  Argument,
} from "@shared/types";
import { mapMongoToGraphQL } from "../lib/mongoMapper";
import { AppContext } from "@shared/types";

export const argumentMutations = {
  createArgument: async (
    _: any,
    { projectId, themeSlug, input }: MutationCreateArgumentArgs,
    context: AppContext
  ): Promise<Argument | null> => {
    if (!context.isAuthenticated) {
      throw new AuthenticationError();
    }

    try {
      if (!mongoose.Types.ObjectId.isValid(projectId)) {
        throw new NotFoundError("Project");
      }

      const project = await Project.findById(projectId);

      if (!project) {
        throw new NotFoundError("Project");
      }

      // Authorization: Only project OWNER may add arguments
      const userId = String(context.user?._id || (context.user as any)?.id);
      const userEntry = (project as any).users?.find(
        (u: any) =>
          (typeof u.user === 'string' ? u.user : u.user?._id?.toString()) === userId &&
          u.role === 'OWNER'
      );

      if (!userEntry) {
        throw new AuthenticationError("You are not authorized to add arguments to this project.");
      }

      const theme = project.themes.find((theme:any) => theme.slug === themeSlug);

      if (!theme) {
        throw new NotFoundError("Theme");
      }

      // Pre-validate argument limits per sentiment
      const currentPositiveCount = theme.arguments.filter((arg: any) => arg.sentiment === 'POSITIVE').length;
      const currentNegativeCount = theme.arguments.filter((arg: any) => arg.sentiment === 'NEGATIVE').length;

      if (input.sentiment === 'POSITIVE' && currentPositiveCount >= 5) {
        throw new Error("Maximaal 5 positieve argumenten per thema toegestaan!");
      }

      if (input.sentiment === 'NEGATIVE' && currentNegativeCount >= 5) {
        throw new Error("Maximaal 5 negatieve argumenten per thema toegestaan!");
      }

      // Source-effect identity is theme-independent: a draft (project-level) and
      // the argument it becomes share this key, so "used" detection survives the
      // convert regardless of which theme the user files it under.
      const sourceEffect = input.sourceEffect
        ? {
            sourceKind: input.sourceEffect.sourceKind,
            sourceId: String(input.sourceEffect.sourceId),
            effectId: String(input.sourceEffect.effectId),
            page: input.sourceEffect.page ?? undefined,
            text: input.sourceEffect.text ?? undefined,
          }
        : undefined;

      const sourceEffectWithKey = sourceEffect
        ? {
            ...sourceEffect,
            key: [
              sourceEffect.sourceKind,
              sourceEffect.sourceId,
              sourceEffect.effectId,
            ].join(":"),
          }
        : undefined;

      if (
        sourceEffectWithKey &&
        theme.arguments.some((arg: any) => arg.sourceEffect?.key === sourceEffectWithKey.key)
      ) {
        throw new Error("Dit AI-resultaat is al toegevoegd aan de scan.");
      }

      const argumentId = new mongoose.Types.ObjectId();
      const argumentInput = {
        _id: argumentId,
        title: input.title,
        explanation: input.explanation,
        importance: input.importance,
        sentiment: input.sentiment,
        timeFrame: input.timeFrame || [],
        location: input.location || [],
        source: {
          type: input.source.type,
          link: input.source.link ? decodeURIComponent(input.source.link) : undefined,
        },
        ...(sourceEffectWithKey ? { sourceEffect: sourceEffectWithKey } : {}),
        sourceTitle: (input as any).sourceTitle || undefined,
        generatedByAi: input.generatedByAi || false,
        aiProposal: input.aiProposal || undefined,
        discussionPoint: input.discussionPoint,
        order: input.order,
      };

      const updateQuery: Record<string, any> = { _id: projectId, "themes.slug": themeSlug };
      if (sourceEffectWithKey) {
        updateQuery["themes.arguments.sourceEffect.key"] = { $ne: sourceEffectWithKey.key };
      }

      const updatedProject = await Project.findOneAndUpdate(
        updateQuery,
        { $push: { "themes.$.arguments": argumentInput } },
        { returnDocument: "after" }
      );

      if (!updatedProject && sourceEffectWithKey) {
        throw new Error("Dit AI-resultaat is al toegevoegd aan de scan.");
      }

      // When this argument is the conversion of a project-level AI draft, mark that
      // draft converted (keyed by its own id, not a sourceEffect-key match). The draft
      // record stays for AI-dashboard "used" tracking; the to-do list hides it on this
      // marker. Best-effort: a failure here must not undo the created argument.
      const fromDraftEffectId = (input as { fromDraftEffectId?: string }).fromDraftEffectId;
      if (fromDraftEffectId && mongoose.Types.ObjectId.isValid(fromDraftEffectId)) {
        await Project.updateOne(
          { _id: projectId, "aiDraftEffects._id": fromDraftEffectId },
          { $set: { "aiDraftEffects.$.convertedArgumentId": argumentId } }
        );
      }

      const argument: IArgument | undefined = updatedProject?.themes
        .flatMap((theme: any) => theme.arguments)
        .find((arg: any) => arg._id.toString() === argumentId.toString());

      if (!argument) {
        throw new NotFoundError("Argument");
      }

      return mapMongoToGraphQL<ArgumentType>(argument);
    } catch (error) {
      handleMongoError(error);
      return null;
    }
  },
  updateArgument: async (
    _: any,
    { id, input }: MutationUpdateArgumentArgs,
    context: AppContext
  ): Promise<Argument | null> => {
    if (!context.isAuthenticated) {
      throw new AuthenticationError();
    }

    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new NotFoundError("Argument");
      }
      const updateFields = Object.entries(input)
        .filter(([_, value]) => value !== undefined)
        .reduce((acc, [key, value]) => {
          if (key === 'source' && value && typeof value === 'object') {
            const source = value as any;
            acc[`themes.$.arguments.$[elem].source`] = {
              type: source.type,
              link: source.link ? decodeURIComponent(source.link) : undefined,
            };
          } else {
            acc[`themes.$.arguments.$[elem].${key}`] = value;
          }
          return acc;
        }, {} as Record<string, any>);

      const project = await Project.findOneAndUpdate(
        { "themes.arguments._id": id },
        { $set: updateFields },
        { arrayFilters: [{ "elem._id": id }], new: true }
      );

      const argument = project?.themes
        .flatMap((theme:any) => theme.arguments)
        .find((arg: any) => arg.id.toString() === id);

      if (!argument) {
        throw new NotFoundError("Argument");
      }

      return mapMongoToGraphQL<ArgumentType>(argument);
    } catch (error) {
      handleMongoError(error);
      return null;
    }
  },
  // Move an existing argument to a different theme. Arguments are nested under
  // themes[].arguments[], so this pulls the subdoc from its current theme and
  // pushes it (same _id, so comments stay linked) onto the target theme. Hard
  // caps mirror createArgument; UI-only caps (overzicht/total) are not enforced.
  moveArgumentToTheme: async (
    _: any,
    { projectId, argumentId, themeSlug }: { projectId: string; argumentId: string; themeSlug: string },
    context: AppContext
  ): Promise<Argument | null> => {
    if (!context.isAuthenticated) {
      throw new AuthenticationError();
    }

    try {
      if (!mongoose.Types.ObjectId.isValid(projectId) || !mongoose.Types.ObjectId.isValid(argumentId)) {
        throw new NotFoundError("Argument");
      }

      const project = await Project.findById(projectId);
      if (!project) {
        throw new NotFoundError("Project");
      }

      const userId = String(context.user?._id || (context.user as any)?.id);
      const userEntry = (project as any).users?.find(
        (u: any) =>
          (typeof u.user === 'string' ? u.user : u.user?._id?.toString()) === userId &&
          u.role === 'OWNER'
      );
      if (!userEntry) {
        throw new AuthenticationError("You are not authorized to move arguments in this project.");
      }

      const targetTheme = project.themes.find((theme: any) => theme.slug === themeSlug);
      if (!targetTheme) {
        throw new NotFoundError("Theme");
      }

      let currentTheme: any;
      let argument: any;
      for (const theme of project.themes) {
        const found = (theme as any).arguments.id(argumentId);
        if (found) {
          currentTheme = theme;
          argument = found;
          break;
        }
      }
      if (!argument) {
        throw new NotFoundError("Argument");
      }

      // Already in the target theme — nothing to move.
      if (currentTheme.slug === themeSlug) {
        return mapMongoToGraphQL<ArgumentType>(argument);
      }

      // Hard caps (mirror createArgument).
      if (
        argument.sentiment === 'POSITIVE' &&
        targetTheme.arguments.filter((a: any) => a.sentiment === 'POSITIVE').length >= 5
      ) {
        throw new Error("Maximaal 5 positieve argumenten per thema toegestaan!");
      }
      if (
        argument.sentiment === 'NEGATIVE' &&
        targetTheme.arguments.filter((a: any) => a.sentiment === 'NEGATIVE').length >= 5
      ) {
        throw new Error("Maximaal 5 negatieve argumenten per thema toegestaan!");
      }
      if (
        argument.sourceEffect?.key &&
        targetTheme.arguments.some((a: any) => a.sourceEffect?.key === argument.sourceEffect.key)
      ) {
        throw new Error("Dit AI-resultaat is al toegevoegd aan dit thema.");
      }

      // Preserve the subdocument (incl. _id) and append it to the target theme.
      const moved = argument.toObject();
      const maxOrder = targetTheme.arguments.reduce(
        (max: number, a: any) => Math.max(max, a.order ?? 0),
        0
      );
      moved.order = maxOrder + 1;
      argument.deleteOne();
      targetTheme.arguments.push(moved);
      await project.save();

      const persisted = targetTheme.arguments.find((a: any) => a._id.toString() === argumentId);
      if (!persisted) {
        throw new NotFoundError("Argument");
      }

      return mapMongoToGraphQL<ArgumentType>(persisted);
    } catch (error) {
      handleMongoError(error);
      return null;
    }
  },
  reorderArguments: async (
    _: any,
    { input }: { input: { id: string; order: number }[] },
    context: AppContext
  ): Promise<Argument[]> => {
    if (!context.isAuthenticated) {
      throw new AuthenticationError();
    }
    try {
      // Find all projects containing any of the argument IDs
      const projects = await Project.find({
        "themes.arguments._id": { $in: input.map((item) => item.id) },
      });

      const updatedArguments: Argument[] = [];

      for (const { id, order } of input) {
        // Find the project and theme containing this argument
        const project = projects.find((proj) =>
          proj.themes.some((theme: any) =>
            theme.arguments.some((arg: any) => arg._id.toString() === id)
          )
        );
        if (!project) continue;

        const theme = project.themes.find((theme: any) =>
          theme.arguments.some((arg: any) => arg._id.toString() === id)
        );
        if (!theme) continue;

        const argument = theme.arguments.find(
          (arg: any) => arg._id.toString() === id
        );
        if (!argument) continue;

        (argument as any).order = order;
        const mapped = mapMongoToGraphQL<ArgumentType>(argument);
        if (mapped) updatedArguments.push(mapped);
        await project.save();
      }

      return updatedArguments;
    } catch (error) {
      handleMongoError(error);
      return [];
    }
  },
  deleteArguments: async (
    _: any,
    { projectId, argumentIds }: MutationDeleteArgumentsArgs,
    context: AppContext
  ): Promise<boolean> => {
    if (!context.isAuthenticated) {
      throw new AuthenticationError();
    }

    try {
      if (!mongoose.Types.ObjectId.isValid(projectId)) {
        throw new NotFoundError("Project");
      }

      // Find the project first
      const project = await Project.findById(projectId);

      if (!project) {
        throw new NotFoundError("Project");
      }

      // Authorization: Only OWNER can delete arguments (same permissions as delete project)
      const userId = String(context.user?._id);
      const userEntry = (project as any).users.find(
        (u: any) =>
          (typeof u.user === 'string' ? u.user : u.user._id?.toString()) === userId &&
          u.role === 'OWNER'
      );
      if (!userEntry) {
        throw new AuthenticationError('You are not authorized to delete arguments from this project.');
      }

      // Validate all argument IDs
      for (const argumentId of argumentIds) {
        if (!mongoose.Types.ObjectId.isValid(argumentId)) {
          throw new NotFoundError("Argument");
        }
      }

      // Remove arguments from all themes using $pull operator
      await Project.updateOne(
        { _id: projectId },
        { $pull: { "themes.$[].arguments": { _id: { $in: argumentIds } } } }
      );

      return true;
    } catch (error) {
      handleMongoError(error);
      return false;
    }
  },
};
