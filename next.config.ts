import type { NextConfig } from 'next';

const nextConfig:NextConfig={
  reactStrictMode:true,
  poweredByHeader:false,
  async headers(){
    return [{
      source:'/:path*',
      headers:[
        {
          key:'Strict-Transport-Security',
          value:'max-age=31536000; includeSubDomains',
        },
        {
          key:'X-Permitted-Cross-Domain-Policies',
          value:'none',
        },
      ],
    }];
  },
};

export default nextConfig;
