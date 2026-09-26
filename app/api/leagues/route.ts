import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';

const Schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('create'),name:z.string().trim().min(3).max(60),description:z.string().trim().max(300).optional()}),
  z.object({action:z.literal('join'),code:z.string().trim().min(4).max(30)}),
  z.object({action:z.literal('leave'),leagueId:z.string().uuid()})
]);

export async function POST(req:Request){
  try{
    const input=Schema.parse(await req.json());
    const s=await createClient();
    const {data:{user}}=await s.auth.getUser();

    if(!user){
      return NextResponse.json({error:'Não autenticado.'},{status:401});
    }

    if(input.action==='create'){
      const {data,error}=await s.rpc('create_league',{
        p_name:input.name,
        p_description:input.description||null,
        p_private:true
      });

      if(error){
        const message=error.message||'';
        if(message.includes('league_limit_reached')){
          return NextResponse.json({
            error:'Você atingiu o limite de ligas que pode criar no seu plano.',
            code:'LEAGUE_LIMIT',
            upgradeUrl:'/planos'
          },{status:429});
        }
        if(message.includes('invalid_name')){
          return NextResponse.json({error:'Escolha um nome válido para a liga.'},{status:400});
        }
        return NextResponse.json({error:'Não foi possível criar a liga.'},{status:500});
      }

      return NextResponse.json({ok:true,leagueId:(data as any)?.id});
    }

    if(input.action==='join'){
      const {data,error}=await s.rpc('join_league',{p_invite_code:input.code});
      if(error){
        const status=(error.message||'').includes('league_not_found')?404:500;
        return NextResponse.json({
          error:status===404?'Código de liga não encontrado.':'Não foi possível entrar na liga.'
        },{status});
      }
      return NextResponse.json({ok:true,leagueId:data});
    }

    const {error}=await s.rpc('leave_league',{p_league_id:input.leagueId});
    if(error){
      const message=error.message||'';
      return NextResponse.json({
        error:message.includes('owner_cannot_leave')
          ?'O dono não pode sair da própria liga.'
          :'Não foi possível sair.'
      },{status:409});
    }

    return NextResponse.json({ok:true});
  }catch(e){
    if(e instanceof z.ZodError){
      return NextResponse.json({error:'Dados inválidos.'},{status:400});
    }
    return NextResponse.json({error:'Erro interno.'},{status:500});
  }
}
