import mongoose, { Document } from "mongoose"
import { IUser } from "@shared/types"
import type { UserData } from "../../../shared/types/src/user"
import { GraphQLError } from 'graphql/error'
import { Request, Response } from 'express'
import fetch from 'node-fetch'
import { IncomingHttpHeaders } from "http"
import { User } from "../models/User"
import config from "../config"

interface UserDocument extends Document, IUser {}

const isDevelopment = config.nodeEnv === 'development'

export const verifyToken = async (token: string): Promise<IUser | null> => {
  try {
    const userData = await checkUserToken(token)
    if (!userData) return null

    const now = new Date()
    return {
      entraId: userData.userPrincipalName,
      email: userData.mail.toLowerCase(),
      displayName: userData.displayName,
      createdAt: now,
      updatedAt: now
    }
  } catch (error) {
    console.error('Error verifying token:', error)
    return null
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    export interface Request {
      user: UserDocument
    }
  }
}

export const getUserForApi = async (headers: IncomingHttpHeaders): Promise<UserDocument> => {
  // Apollo Studio development support
  if (headers['origin'] === 'https://studio.apollographql.com' && isDevelopment) {
    const now = new Date()
    const testUser = new UserModel({
      entraId: process.env.TEST_USER_ID || 'test-user',
      email: 'test@example.com',
      displayName: 'TEST, USER',
      createdAt: now,
      updatedAt: now
    })
    return testUser
  }

  // Verify Authorization header
  const authHeader = headers['authorization']
  if (!authHeader) {
    throw new GraphQLError('No authorization header', {
      extensions: { code: 'UNAUTHENTICATED' }
    })
  }

  const userData = await checkUserToken(authHeader)
  if (!userData) {
    throw new GraphQLError('Invalid token', {
      extensions: { code: 'UNAUTHENTICATED' }
    })
  }

  const user = await addUserToDatabase(userData)
  if (!user) {
    throw new GraphQLError('Failed to create/update user', {
      extensions: { code: 'INTERNAL_SERVER_ERROR' }
    })
  }

  return user
}

const checkUserToken = async (accessToken: string): Promise<UserData | null> => {
  try {
    const options = {
      headers: {
        Authorization: accessToken
      }
    }
    const result = await fetch(process.env.GRAPH_API_ENDPOINT || 'https://graph.microsoft.com/v1.0/me', options)
    if (!result.ok) {
      console.error('Graph API error:', await result.text())
      return null
    }
    return await result.json() as UserData
  } catch (error) {
    console.error('Error checking user token:', error)
    return null
  }
}

const addUserToDatabase = async (userData: UserData): Promise<UserDocument | null> => {
  try {
    const now = new Date()
    const userDoc: IUser = {
      entraId: userData.userPrincipalName,
      email: userData.mail.toLowerCase(),
      displayName: userData.displayName,
      createdAt: now,
      updatedAt: now
    }

    let user = await User.findOne({ email: userDoc.email })
    if (!user) {
      user = await User.create(userDoc)
    } else {
      user.displayName = userDoc.displayName
      user.updatedAt = now
      await user.save()
    }

    return user
  } catch (error) {
    console.error('Error adding user to database:', error)
    return null
  }
}
