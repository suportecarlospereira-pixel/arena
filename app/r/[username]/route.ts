import { NextResponse } from 'next/server';

export async function GET(req:Request,{params}:{params:Promise<{username:string}>}){
  const {username}=await params;
  const url=new URL('/register',req.url);
  url.searchParams.set('ref',username.toLowerCase());
  return NextResponse.redirect(url);
}
