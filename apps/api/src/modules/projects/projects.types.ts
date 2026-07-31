/**
 * The public HTTP representation of a project. Deliberately mapped by hand
 * from the Drizzle row rather than returned as-is, so the API's camelCase,
 * stable field set stays decoupled from the database's own column set.
 */
export interface ProjectResponse {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  supabaseUrl: string;
  publishableKey: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}
