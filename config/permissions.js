// Central role -> permission map. Every admin route checks this via
// middleware/rbac.js — permissions are never enforced by hiding UI alone.
//
// SUPER_ADMIN implicitly has every permission (checked separately).
// Portal roles (RECEPTIONIST, DOCTOR) use the existing hospital/doctor-scoped
// routes under /api and /receptionist, not these admin permissions.

const PERMISSIONS = [
  'dashboard.view',
  'hospitals.view', 'hospitals.manage',
  'branches.view', 'branches.manage',
  'kyc.view', 'kyc.manage',
  'doctors.view', 'doctors.manage', 'doctors.verify',
  'receptionists.view', 'receptionists.manage',
  'qr.view', 'qr.manage',
  'appointments.view', 'appointments.manage',
  'patients.view',
  'payments.view',
  'webhooks.view', 'webhooks.manage',
  'refunds.view', 'refunds.manage', 'refunds.approve',
  'settlements.view', 'settlements.manage',
  'support.view', 'support.manage',
  'disputes.view', 'disputes.manage',
  'communications.view', 'communications.manage',
  'analytics.view',
  'settings.view', 'settings.manage',
  'feature_flags.view', 'feature_flags.manage',
  'app_versions.view', 'app_versions.manage',
  'audit_logs.view',
];

const ROLE_PERMISSIONS = {
  SUPER_ADMIN: PERMISSIONS, // full platform access

  FINANCE: [
    'dashboard.view',
    'payments.view', 'webhooks.view', 'webhooks.manage',
    'refunds.view', 'refunds.manage', 'refunds.approve',
    'settlements.view', 'settlements.manage',
    'analytics.view',
  ],

  SUPPORT: [
    'dashboard.view',
    'patients.view',
    'appointments.view', 'appointments.manage',
    'support.view', 'support.manage',
    'disputes.view', 'disputes.manage',
  ],

  OPERATIONS: [
    'dashboard.view',
    'hospitals.view', 'hospitals.manage',
    'branches.view', 'branches.manage',
    'kyc.view', 'kyc.manage',
    'doctors.view', 'doctors.manage', 'doctors.verify',
    'receptionists.view', 'receptionists.manage',
    'qr.view', 'qr.manage',
    'feature_flags.view', 'feature_flags.manage',
  ],
};

const ADMIN_ROLES = Object.keys(ROLE_PERMISSIONS);

function permissionsFor(role) {
  return new Set(ROLE_PERMISSIONS[role] || []);
}

function roleHas(role, permission) {
  return permissionsFor(role).has(permission);
}

module.exports = { PERMISSIONS, ROLE_PERMISSIONS, ADMIN_ROLES, permissionsFor, roleHas };
