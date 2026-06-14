import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const check = await query('SELECT id FROM security_alerts WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    await query('UPDATE security_alerts SET resolved = true WHERE id = $1', [id]);

    return NextResponse.json({ success: true, message: 'Alert resolved' });
  } catch (error: any) {
    console.error('Error resolving alert:', error);
    return NextResponse.json({ error: 'Failed to resolve alert' }, { status: 500 });
  }
}
