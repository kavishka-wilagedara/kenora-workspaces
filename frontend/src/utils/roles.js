export const ROLES = { ADMIN: 'ADMIN', MANAGER: 'MANAGER', STAFF: 'STAFF' };
export const ROLE_LABELS = { ADMIN: 'Administrator', MANAGER: 'Programme manager', STAFF: 'Front desk' };

export const can = {
  manageUsers: (role) => role === ROLES.ADMIN,
  manageWorkshops: (role) => role === ROLES.MANAGER,
  register: (role) => role === ROLES.MANAGER || role === ROLES.STAFF,
  viewAudit: (role) => role === ROLES.ADMIN || role === ROLES.MANAGER,
};

export const homeFor = (role) => (role === ROLES.ADMIN ? '/users' : '/workshops');
