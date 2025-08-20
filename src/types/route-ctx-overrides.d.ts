// Force correct RouteContext types for dynamic API routes so Next's generated ParamCheck passes
import type { NextRequest } from 'next/server'

declare module '../../../../src/app/api/live/room/[id]/join/route.js' {
  export const dynamic: string
  export function POST(req: NextRequest, ctx: { params: Promise<Record<string, any>> }): Promise<Response>
}

declare module '../../../../src/app/api/live/room/[id]/publish/route.js' {
  export const dynamic: string
  export function POST(req: NextRequest, ctx: { params: Promise<Record<string, any>> }): Promise<Response>
}

declare module '../../../../src/app/api/live/room/[id]/subscribe/route.js' {
  export const dynamic: string
  export function GET(req: NextRequest, ctx: { params: Promise<Record<string, any>> }): Promise<Response>
}
