import { Document, Types } from 'mongoose';

export type MongoDoc = Document & Record<string, any>;
export type GraphQLType = Record<string, any>;

/**
 * Maps a value to its GraphQL equivalent, handling ObjectIds, nested objects, and arrays
 */
function mapValue(value: any): any {
  if (value instanceof Types.ObjectId) {
    return value.toString();
  }

  if (value instanceof Date) {
    return value;  // GraphQL DateTime scalar will handle the serialization
  }

  if (Array.isArray(value)) {
    return value.map(item => mapValue(item));
  }

  if (value && typeof value === 'object') {
    return mapMongoDocToObject(value);
  }

  return value;
}

/**
 * Maps a MongoDB document or object to a GraphQL-compatible object
 */
function mapMongoDocToObject(doc: Record<string, any>): Record<string, any> {
  const rawObj = doc.toObject ? doc.toObject() : doc;

  return Object.entries(rawObj).reduce(
    (obj, [key, value]) => {
      if (key === '_id') {
        obj.id = mapValue(value);
      } else if (key !== '__v') {
        obj[key] = mapValue(value);
      }
      return obj;
    },
    {} as Record<string, any>
  );
}

/**
 * Maps a MongoDB document to a GraphQL type, stripping Mongoose-specific fields
 * and recursively handling nested objects and arrays
 */
export function mapMongoToGraphQL<T extends GraphQLType>(
  doc: MongoDoc | Record<string, any> | null,
  omitFields: string[] = ['__v']
): T | null {
  if (!doc) return null;
  return mapMongoDocToObject(doc) as T;
}
