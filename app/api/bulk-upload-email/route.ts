import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      message: 'Bulk upload email notifications are currently disabled.',
    },
    { status: 410 }
  )
}