class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const badRequest = (message, details) => new HttpError(400, message, details);
const notFound = (message = 'Not found.') => new HttpError(404, message);
const forbidden = (message = "You don't have permission to do this.") => new HttpError(403, message);

// Only allow same-site relative redirects such as "/doctors?x=1".
function safeNext(next, fallback = '/dashboard') {
  if (typeof next !== 'string') return fallback;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}

module.exports = { HttpError, badRequest, notFound, forbidden, safeNext };
