import fs from 'fs';
import { NextResponse } from 'next/server';
import hospitalLogos from '../../../../services/hospitalLogos';

// Public hospital logos (portals and the patient app). Only files a hospital's logo_url points
// at are served, never anything else in the upload folder.
export async function GET(req, ctx) {
  const { file } = await ctx.params;
  const found = await hospitalLogos.fileFor(file);
  if (!found) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return new NextResponse(fs.readFileSync(found.full), { headers: { 'Content-Type': found.type, 'Cache-Control': 'public, max-age=86400' } });
}
