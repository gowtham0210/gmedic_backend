// Hospital logos shown in the patient app and the portals (services/publicImages): set by Super
// Admin, served publicly at /api/hospital-logos/<file>.
const { imageStore } = require('./publicImages');

const store = imageStore({ table: 'hospitals', column: 'logo_url', prefix: '/api/hospital-logos/', field: 'logo', noun: 'logo', entityType: 'HOSPITAL', action: 'HOSPITAL_LOGO' });

module.exports = {
  setLogo: (req, hospital) => store.set(req, { id: hospital.id, name: hospital.name, current: hospital.logo_url }),
  removeLogo: (req, hospital) => store.remove(req, { id: hospital.id, name: hospital.name, current: hospital.logo_url }),
  fileFor: store.fileFor,
};
