const { uniqueConflict } = require('../utils/dbErrors');

function notFound(req, res) {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found.' });
  res.status(404).render('error', { title: 'Page not found', status: 404, message: "The page you're looking for doesn't exist or has moved." });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(caught, req, res, next) {
  const err = uniqueConflict(caught) || caught;
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);

  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) {
    const body = { error: status >= 500 ? 'Something went wrong. Please try again.' : err.message };
    if (err.details) body.fields = err.details;
    return res.status(status).json(body);
  }
  res.status(status).render('error', {
    title: 'Something went wrong',
    status,
    message: status >= 500 ? 'An unexpected error occurred. Please try again.' : err.message,
  });
}

module.exports = { notFound, errorHandler };
