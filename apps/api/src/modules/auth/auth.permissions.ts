import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements } from 'better-auth/plugins/admin/access';

/**
 * `defaultStatements` carries the admin plugin's own `user`/`session`
 * resources (ban, impersonate, set-role, ...). Passing a custom `ac`/`roles`
 * to the admin plugin fully replaces its defaults rather than merging with
 * them, so those actions are spread in here to keep the plugin's built-in
 * user-management routes usable by the `admin` role.
 */
export const statements = {
  ...defaultStatements,
  project: ['create', 'read', 'update', 'delete'],
  workflow: ['create', 'read', 'update', 'delete', 'execute'],
  execution: ['read', 'delete'],
  user: ['create', 'read', 'update', 'delete'],
} as const;

export const accessControl = createAccessControl(statements);

export const adminRole = accessControl.newRole({
  ...defaultStatements,
  project: ['create', 'read', 'update', 'delete'],
  workflow: ['create', 'read', 'update', 'delete', 'execute'],
  execution: ['read', 'delete'],
  user: ['create', 'read', 'update', 'delete'],
});

export const viewerRole = accessControl.newRole({
  project: ['read'],
  workflow: ['read'],
  execution: ['read'],
});

export const roles = {
  admin: adminRole,
  viewer: viewerRole,
};
