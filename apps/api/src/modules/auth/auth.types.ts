export const APPLICATION_ROLES = ['admin', 'viewer'] as const;

export type ApplicationRole = (typeof APPLICATION_ROLES)[number];

export const DEFAULT_APPLICATION_ROLE: ApplicationRole = 'viewer';
