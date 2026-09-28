import { IArgument } from './argument';

export interface ITheme {
  name: string;
  slug: string; // URL-friendly unique identifier
  description: string;
  isActive: boolean;
  arguments: IArgument[];
  createdAt: Date;
  updatedAt: Date;
}
