import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements } from 'better-auth/plugins/admin/access';

/**
 * `defaultStatements.user` (`create`, `list`, `set-role`, `ban`,
 * `impersonate`, `impersonate-admins`, `delete`, `set-password`,
 * `set-email`, `get`, `update`) is the admin plugin's own action
 * vocabulary for its built-in user-management routes (including
 * `/admin/create-user` assigning a `role`, which requires `set-role`).
 * Passing a custom `ac`/`roles` to the admin plugin fully replaces its
 * defaults rather than merging with them, so `user` must be spread here
 * rather than redefined — redefining it (even to a list that looks like a
 * superset) silently drops every action not named, which previously
 * broke role assignment through `/admin/create-user` for the `admin`
 * role.
 */
export const statements = {
  ...defaultStatements,
  project: ['create', 'read', 'update', 'delete'],
  workflow: ['create', 'read', 'update', 'delete', 'execute'],
  execution: ['read', 'delete'],
} as const;

export const accessControl = createAccessControl(statements);

export const adminRole = accessControl.newRole({
  ...defaultStatements,
  project: ['create', 'read', 'update', 'delete'],
  workflow: ['create', 'read', 'update', 'delete', 'execute'],
  execution: ['read', 'delete'],
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
