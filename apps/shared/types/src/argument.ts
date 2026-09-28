export interface IArgument {
  title: string;
  explanation: string; // Can contain theme references in markdown format: [text](#theme-slug)
  importance: string;
  timeFrame: string[];
  location: string[];
  source: IArgumentSource;
  sourceEffect?: IArgumentSourceEffect;
  generatedByAi?: boolean;
  aiProposal?: string;
  themes?: string[]; // Array of theme slugs this argument is tagged with
  sentiment: string;
  discussionPoint: boolean;
  order: number; // Unique integer representing the position of the argument
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IArgumentSource {
  type: string;
  link?: string;
}

export interface IArgumentSourceEffect {
  key: string;
  sourceKind: 'OPEN_RESEARCH' | 'UPLOADED_DOCUMENT';
  sourceId: string;
  effectId: string;
  // Only set on legacy records: source effects are themeless, a theme is picked
  // when the effect is turned into an argument.
  themeSlug?: string;
  page?: number;
  text?: string;
}
