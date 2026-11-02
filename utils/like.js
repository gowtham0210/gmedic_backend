// A LIKE pattern that matches `term` anywhere, with the LIKE wildcards in it taken literally.
// Use with `... LIKE ? ESCAPE '\\'`.
const contains = (term) => `%${String(term).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

module.exports = { contains };
