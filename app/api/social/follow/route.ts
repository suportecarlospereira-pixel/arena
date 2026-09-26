import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
const Schema=z.object({username:z.string().trim().min(3).max(30),follow:z.boolean()});
export async function POST(req:Request){
 try{const input=Schema.parse(await req.json());const s=await createClient();const {data:{user}}=await s.auth.getUser();if(!user)return NextResponse.json({error:'Faça login para seguir jogadores.'},{status:401});
 const {data,error}=await s.rpc('follow_user',{p_username:input.username,p_follow:input.follow});
 if(error){const m=error.message||'';const status=m.includes('user_not_found')?404:m.includes('cannot_follow_self')?409:500;return NextResponse.json({error:status===404?'Usuário não encontrado.':status===409?'Você não pode seguir a si mesmo.':'Não foi possível atualizar.'},{status});}
 return NextResponse.json({ok:true,following:Boolean(data)});
 }catch(e){if(e instanceof z.ZodError)return NextResponse.json({error:'Dados inválidos.'},{status:400});return NextResponse.json({error:'Erro interno.'},{status:500});}
}