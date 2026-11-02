-- Appointment notifications used to store the receptionist link (/appointments) for every recipient,
-- so a doctor opening one landed on a page they cannot see. New ones get a per-portal link
-- (services/notificationService.js linkFor); this repoints the doctors' existing ones.
UPDATE notifications SET link = '/doctor/appointments'
 WHERE link = '/appointments' AND user_id IN (SELECT id FROM users WHERE role = 'DOCTOR');
