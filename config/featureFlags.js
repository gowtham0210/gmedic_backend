// The feature flags the platform knows. A flag with `implemented: false` has nothing behind it yet, so the
// admin screen shows it as "not available yet" instead of offering a switch that does nothing.
// The state of a flag: a hospital's own override if it has one, else the platform default row, else `default`
// (services/featureFlags.js).

const FLAGS = {
  live_queue: {
    label: 'Live queue position',
    description: 'Patients see how many people are ahead of them in the doctor\'s queue once they are checked in.',
    implemented: true, default: false,
  },
  rotating_qr: {
    label: 'Rotating QR codes',
    description: 'Hospital QR codes that change on a schedule so a photographed poster stops working.',
    implemented: false, default: false,
  },
};

module.exports = { FLAGS };
