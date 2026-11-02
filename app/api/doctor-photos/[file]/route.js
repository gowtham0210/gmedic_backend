import fs from 'fs';
import { NextResponse } from 'next/server';
import doctorPhotos from '../../../../services/doctorPhotos';

// Public doctor profile photos (portals and the patient app). Only files a doctor's photo_url points
// at are served, never anything else in the upload folder.
export async function GET(req, ctx) {
  const { file } = await ctx.params;
  const found = await doctorPhotos.fileFor(file);
  if (!found) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return new NextResponse(fs.readFileSync(found.full), { headers: { 'Content-Type': found.type, 'Cache-Control': 'public, max-age=86400' } });
}
