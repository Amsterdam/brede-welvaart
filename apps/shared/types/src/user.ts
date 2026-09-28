export interface UserData {
  mail: string;
  displayName: string;
  userPrincipalName: string;
}

export interface IUser {
  entraId: string;
  email: string;
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
}
