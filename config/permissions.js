// Central role -> permission map. Every API route checks this server-side —
// permissions are never enforced by hiding UI alone.
//
// SUPER_ADMIN has every permission. Doctors and receptionists only get the
// "own" support permissions; the rest of their access is scoped by their
// session (hospital / doctor) in the portal-specific API routes.
//
// Appointments are view-only for every admin role, except one narrow escalation: 'appointments.cancel'
// (Super Admin only) cancels and refunds an appointment nobody else can, e.g. after a hospital is
// offboarded. Rescheduling is done by the patient, and day-to-day handling by the hospital.

const PERMISSIONS = [
  'dashboard.view',
  'hospitals.view', 'hospitals.manage',
  'branches.view', 'branches.manage',
  'kyc.view', 'kyc.manage',
  'doctors.view', 'doctors.manage', 'doctors.verify',
  'receptionists.view', 'receptionists.manage',
  'qr.view', 'qr.manage',
  'appointments.view', 'appointments.cancel',
  'patients.view', 'patients.manage', // manage: block / unblock an app account and erase its personal data (Super Admin only)
  'payments.view',
  'webhooks.view', 'webhooks.manage',
  'refunds.view', 'refunds.manage', 'refunds.approve',
  'support.view_all', 'support.reply', 'support.assign', 'support.update_status', 'support.close',
  'disputes.view', 'disputes.manage',
  'communications.templates.view', 'communications.templates.create', 'communications.templates.update',
  'communications.templates.enable', 'communications.templates.disable',
  'communications.announcements.view', 'communications.announcements.create',
  'communications.announcements.publish', 'communications.announcements.archive',
  'communications.banners.view', 'communications.banners.create', 'communications.banners.update',
  'communications.banners.activate', 'communications.banners.deactivate',
  'analytics.view',
  'settings.view', 'settings.manage',
  'feature_flags.view', 'feature_flags.manage',
  'app_versions.view', 'app_versions.manage',
  'audit_logs.view',
  'team.view', 'team.manage', // admin console accounts: Super Admin only
];

const OWN_SUPPORT = ['support.create', 'support.view_own', 'support.reply_own'];

const ROLE_PERMISSIONS = {
  SUPER_ADMIN: PERMISSIONS, // full platform access

  FINANCE: [
    'dashboard.view',
    'hospitals.view',
    'payments.view', 'webhooks.view', 'webhooks.manage',
    'refunds.view', 'refunds.manage', 'refunds.approve',
    'disputes.view', 'disputes.manage',
    'analytics.view',
  ],

  SUPPORT: [
    'dashboard.view',
    'patients.view',
    'appointments.view',
    'support.view_all', 'support.reply', 'support.assign', 'support.update_status', 'support.close',
    'disputes.view',
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

  DOCTOR: OWN_SUPPORT,
  RECEPTIONIST: OWN_SUPPORT,
};

// Roles that use the Super Admin console. (DOCTOR / RECEPTIONIST have their own portals.)
const ADMIN_ROLES = ['SUPER_ADMIN', 'FINANCE', 'SUPPORT', 'OPERATIONS'];

function permissionsFor(role) {
  return new Set(ROLE_PERMISSIONS[role] || []);
}

function roleHas(role, permission) {
  return permissionsFor(role).has(permission);
}

module.exports = { PERMISSIONS, ROLE_PERMISSIONS, ADMIN_ROLES, permissionsFor, roleHas };
