import { next } from '@vercel/functions';
import { authorize } from './server/auth';
export default async function middleware(request: Request) {
  const response = await authorize(request, process.env);
  return response ?? next({ headers: { 'Cache-Control': 'private, no-store' } });
}
export const config = { matcher: '/:path*' };
