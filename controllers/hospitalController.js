const QRCode = require('qrcode');
const hospitalModel = require('../models/hospitalModel');
const { buildPosterSvg } = require('../services/qrPoster');
const { validate } = require('../utils/validate');
const { badRequest, notFound } = require('../utils/http');

const QR_COLORS = { dark: '#0F263D', light: '#FFFFFF' };

async function load(req) {
  const hospital = await hospitalModel.findById(req.hospitalId);
  if (!hospital) throw notFound('Hospital not found.');
  return hospital;
}

// The hospital's active QR link; a 404 with a clear message when every code was revoked.
async function activeLink(hospital) {
  const link = await hospitalModel.qrPayload(hospital);
  if (!link) throw notFound('This hospital has no active QR code. Contact Gmedic support to issue a new one.');
  return link;
}

exports.get = async (req, res) => {
  res.json({ hospital: await hospitalModel.toPublic(await load(req)) });
};

exports.update = async (req, res) => {
  await load(req);
  const body = req.body || {};
  const address = body.address || {};
  const { value, errors, ok } = validate(
    { phone: body.phone, email: body.email, line1: address.line1, city: address.city, state: address.state, pincode: address.pincode },
    {
      phone: { label: 'Contact number', type: 'phone', required: true },
      email: { label: 'Email', type: 'email', required: true },
      line1: { label: 'Street address', required: true, minLength: 5, maxLength: 160 },
      city: { label: 'City', required: true, maxLength: 60, pattern: /^[A-Za-z .'-]+$/, message: 'City can only contain letters.' },
      state: { label: 'State', required: true, maxLength: 60, pattern: /^[A-Za-z .'-]+$/, message: 'State can only contain letters.' },
      pincode: { label: 'PIN code', required: true, pattern: /^\d{6}$/, message: 'PIN code must be 6 digits.' },
    }
  );
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);

  const hospital = await hospitalModel.update(req.hospitalId, {
    phone: value.phone,
    email: value.email,
    address: { line1: value.line1, city: value.city, state: value.state, pincode: value.pincode },
  });
  res.json({ ok: true, message: 'Hospital information updated.', hospital: await hospitalModel.toPublic(hospital) });
};

exports.qrSvg = async (req, res) => {
  const hospital = await load(req);
  const svg = await QRCode.toString(await activeLink(hospital), {
    type: 'svg',
    errorCorrectionLevel: 'H',
    margin: 1,
    color: QR_COLORS,
  });
  res.type('image/svg+xml').set('Cache-Control', 'no-store').send(svg);
};

// The branded "Skip the Queue" poster with this hospital's QR code.
exports.qrPoster = async (req, res) => {
  const hospital = await load(req);
  const svg = await buildPosterSvg(hospital, await activeLink(hospital));
  res.type('image/svg+xml').set('Cache-Control', 'no-store');
  if (req.query.download === '1') res.attachment(`gmedic-qr-poster-${hospital.id.toLowerCase()}.svg`);
  res.send(svg);
};

exports.qrPng = async (req, res) => {
  const hospital = await load(req);
  const size = Math.min(Math.max(Number(req.query.size) || 1024, 256), 2048);
  const buffer = await QRCode.toBuffer(await activeLink(hospital), {
    type: 'png',
    errorCorrectionLevel: 'H',
    margin: 2,
    width: size,
    color: QR_COLORS,
  });
  res.type('image/png').set('Cache-Control', 'no-store');
  if (req.query.download === '1') {
    const slug = hospital.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    res.attachment(`gmedic-qr-${hospital.id.toLowerCase()}-${slug}.png`);
  }
  res.send(buffer);
};
