import type { NextConfig } from "next";

export function supabaseOrigin(value = process.env.NEXT_PUBLIC_SUPABASE_URL) {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

export function serviceWorkerContentSecurityPolicy(value = process.env.NEXT_PUBLIC_SUPABASE_URL) {
  const origin = supabaseOrigin(value)
  return `default-src 'self'; script-src 'self'; connect-src 'self'${origin ? ` ${origin}` : ''}`
}

const nextConfig: NextConfig = {
  reactCompiler: true,
  headers: async () => ([
    {
      source: '/pdfjs/:version/:path*',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable',
        },
      ],
    },
    {
      source: '/sw.js',
      headers: [
        { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Content-Security-Policy', value: serviceWorkerContentSecurityPolicy() },
      ],
    },
  ]),
};

export default nextConfig;
