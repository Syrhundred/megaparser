import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
  await mkdir(uploadsDir, { recursive: true });

  const filename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  await writeFile(path.join(uploadsDir, filename), buffer);

  return NextResponse.json({ filename });
}
