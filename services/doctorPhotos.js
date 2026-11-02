// Doctor profile photos (services/publicImages): served publicly at /api/doctor-photos/<file>.
const { imageStore } = require('./publicImages');

const store = imageStore({ table: 'doctors', column: 'photo_url', prefix: '/api/doctor-photos/', field: 'photo', noun: 'photo', entityType: 'DOCTOR', action: 'DOCTOR_PHOTO' });

const current = (doctor) => doctor.photoUrl || doctor.photo_url;

module.exports = {
  setPhoto: (req, doctor) => store.set(req, { id: doctor.id, name: doctor.name, current: current(doctor) }),
  removePhoto: (req, doctor) => store.remove(req, { id: doctor.id, name: doctor.name, current: current(doctor) }),
  fileFor: store.fileFor,
};
