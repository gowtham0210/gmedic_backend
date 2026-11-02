// Plain x.y.z versions, as the mobile apps report them.
const SEMVER = /^\d+\.\d+\.\d+$/;

// -1, 0 or 1 for a < b, a = b, a > b.
function compareVersions(a, b) {
  const x = String(a).split('.').map(Number);
  const y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

module.exports = { SEMVER, compareVersions };
