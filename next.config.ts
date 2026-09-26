import type { NextConfig } from 'next';

const supabaseHost='https://jpdjwcxlxvlgqgbresae.supabase.co';
const supabaseWs='wss://jpdjwcxlxvlgqgbresae.supabase.co';

const csp=[
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseHost} ${supabaseWs}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join('; ');

const nextConfig:NextConfig={
  reactStrictMode:true,
  poweredByHeader:false,
  async headers(){
    return [{
      source:'/:path*',
      headers:[
        {key:'Content-Security-Policy',value:csp},
        {key:'Strict-Transport-Security',value:'max-age=31536000; includeSubDomains; preload'},
        {key:'X-Content-Type-Options',value:'nosniff'},
        {key:'X-Frame-Options',value:'DENY'},
        {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
        {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},
        {key:'X-Permitted-Cross-Domain-Policies',value:'none'},
        {key:'X-DNS-Prefetch-Control',value:'off'},
      ],
    }];
  },
};

export default nextConfig;
