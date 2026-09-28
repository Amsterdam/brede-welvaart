import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { ServiceTokenPayload } from "@shared/types";
import config from "../config";

export function createPDFServiceToken(
  projectId: string,
  userId: string,
  expiresInMinutes: number = 5
): string {
  const payload: Omit<ServiceTokenPayload, "iat" | "exp"> = {
    projectId,
    userId,
    requestId: uuidv4(),
    purpose: "pdf-generation",
  };

  return jwt.sign(payload, config.pdf.serviceSecret, {
    expiresIn: `${expiresInMinutes}m`,
  });
}

export function verifyServiceToken(token: string): ServiceTokenPayload {
  try {
    const decoded = jwt.verify(
      token,
      config.pdf.serviceSecret
    ) as ServiceTokenPayload;

    if (decoded.purpose !== "pdf-generation") {
      throw new Error("Invalid token purpose");
    }

    return decoded;
  } catch (error) {
    throw new Error(
      `Invalid service token: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

export function isServiceToken(token: string): boolean {
  try {
    const decoded = jwt.decode(token) as any;
    return decoded && decoded.purpose === "pdf-generation";
  } catch {
    return false;
  }
}
