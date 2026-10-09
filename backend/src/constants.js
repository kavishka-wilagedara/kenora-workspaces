export const ROLES = Object.freeze({ ADMIN: 'ADMIN', MANAGER: 'MANAGER', STAFF: 'STAFF' });
export const ROLE_LIST = Object.values(ROLES);

export const WORKSHOP_STATUSES = ['SCHEDULED', 'CANCELLED', 'COMPLETED'];
export const REGISTRATION_STATUSES = ['ACTIVE', 'CANCELLED', 'WAITLISTED'];

// The client has three centres; kept as an enum so filters and reports stay clean.
export const LOCATIONS = ['Northside Centre', 'Riverside Centre', 'Downtown Centre'];
