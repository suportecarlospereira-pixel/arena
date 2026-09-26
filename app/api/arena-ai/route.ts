import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {getCurrentProfile,getMatches} from '@/lib/data';
import {fmtDate} from '@/lib/utils';

const Schema=z.object({question:z.string().trim().min(2).max(800)});

function norm(value:string){
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
}

async function teamSnapshot(s:any,team:{id:string;name:string}){
  const select='id,starts_at,status,home_score,away_score,competitions(name),home:teams!matches_home_team_id_fkey(id,name),away:teams!matches_away_team_id_fkey(id,name)';
  const [{data:recent},{data:upcoming}]=await Promise.all([
    s.from('matches').select(select).eq('status','FINISHED').or('home_team_id.eq.'+team.id+',away_team_id.eq.'+team.id).order('starts_at',{ascending:false}).limit(5),
    s.from('matches').select(select).eq('status','SCHEDULED').gt('starts_at',new Date().toISOString()).or('home_team_id.eq.'+team.id+',away_team_id.eq.'+team.id).order('starts_at',{ascending:true}).limit(3)
  ]);

  let wins=0,draws=0,losses=0;
  for(const m of recent??[]){
    if(m.home_score==null||m.away_score==null) continue;
    const isHome=(m.home as any)?.id===team.id;
    const gf=isHome?m.home_score:m.away_score;
    const ga=isHome?m.away_score:m.home_score;
    if(gf>ga) wins++;
    else if(gf===ga) draws++;
    else losses++;
  }

  return {
    recentCount:(recent??[]).length,
    wins,draws,losses,
    upcoming:(upcoming??[]).map((m:any)=>({
      text:(m.home?.name??'Mandante')+' x '+(m.away?.name??'Visitante')+' — '+fmtDate(m.starts_at)+' — '+(m.competitions?.name??'Competição')
    }))
  };
}

export async function POST(req:Request){
  try{
    const {question}=Schema.parse(await req.json());
    const s=await createClient();
    const {data:{user}}=await s.auth.getUser();

    if(!user){
      return NextResponse.json({error:'Faça login para usar a Arena AI.'},{status:401});
    }

    const {data:quotaData,error:quotaError}=await s.rpc('consume_feature_quota',{p_feature:'arena_ai'});
    if(quotaError){
      return NextResponse.json({error:'Não foi possível validar seu limite da Arena AI.'},{status:500});
    }

    const quota=Array.isArray(quotaData)?quotaData[0]:quotaData;
    const usage={
      used:Number(quota?.usage_count??0),
      limit:Number(quota?.usage_limit??0),
      remaining:Math.max(0,Number(quota?.usage_limit??0)-Number(quota?.usage_count??0)),
      plan:String(quota?.plan_code??'FREE')
    };

    if(!quota?.allowed){
      return NextResponse.json({
        error:'Você atingiu o limite diário da Arena AI no plano '+(usage.plan==='PRO_PLUS'?'PRO+':usage.plan)+'.',
        code:'AI_DAILY_LIMIT',
        usage,
        upgradeUrl:'/planos'
      },{status:429});
    }

    const respond=(answer:string)=>NextResponse.json({
      answer,
      provider:'ArenaDatabase',
      usage
    });

    const [profile,matches,teams,ranking]=await Promise.all([
      getCurrentProfile(),
      getMatches(40),
      s.from('teams').select('id,name,short_name').eq('country','Brasil').order('name'),
      s.rpc('get_leaderboard',{
        p_scope:'global',
        p_period:'all',
        p_state:null,
        p_city:null,
        p_limit:10
      })
    ]);

    const q=norm(question);

    if(profile&&(q.includes('meu desempenho')||q.includes('minha precisao')||q.includes('meu perfil')||q.includes('meus palpites'))){
      return respond(
        'Seu painel atual: '+profile.predictions+' palpites, '+profile.hits+' acertos, '+profile.exact+
        ' placares exatos, precisão de '+profile.accuracy+'%, '+Number(profile.xp).toLocaleString('pt-BR')+
        ' XP e sequência atual de '+profile.current_streak+' dia(s). Seu recorde é '+profile.best_streak+' dia(s).'
      );
    }

    if(q.includes('ranking')||q.includes('lider')){
      const top=(ranking.data??[]).slice(0,5).map((r:any)=>
        r.rank_position+'. @'+r.username+' — '+Number(r.xp).toLocaleString('pt-BR')+' XP'
      ).join('\n');

      return respond(top?'Top 5 do ranking geral agora:\n\n'+top:'Ainda não há jogadores pontuados no ranking.');
    }

    if(profile?.favorite_team_id&&(q.includes('meu time')||q.includes('time favorito'))){
      const team=(teams.data??[]).find((t:any)=>t.id===profile.favorite_team_id);
      if(team){
        const snap=await teamSnapshot(s,team as any);
        const next=snap.upcoming.map((x:any)=>x.text).join('\n');
        return respond(
          team.name+' é seu time favorito. Nos últimos '+snap.recentCount+' jogos encerrados disponíveis: '+
          snap.wins+' vitória(s), '+snap.draws+' empate(s) e '+snap.losses+' derrota(s).'+
          (next?'\n\nPróximos jogos:\n'+next:'')
        );
      }
    }

    const mentioned=(teams.data??[]).filter((t:any)=>{
      const name=norm(t.name);
      const short=norm(t.short_name||'');
      return q.includes(name)||(short.length>=3&&q.split(/\s+/).includes(short));
    }).slice(0,2);

    if(mentioned.length){
      const snapshots=await Promise.all(mentioned.map((t:any)=>teamSnapshot(s,t)));
      const blocks=mentioned.map((t:any,i:number)=>{
        const x=snapshots[i];
        const next=x.upcoming.map((g:any)=>g.text).join('\n');
        return t.name+': últimos '+x.recentCount+' jogos disponíveis — '+x.wins+'V, '+x.draws+'E, '+x.losses+'D.'+(next?'\nPróximos:\n'+next:'');
      });

      return respond(
        blocks.join('\n\n')+
        '\n\nA análise usa somente partidas armazenadas na Arena; não preencho estatísticas ausentes.'
      );
    }

    const selected=matches.slice(0,5).map(m=>
      m.home.name+' x '+m.away.name+' — '+fmtDate(m.startsAt)+' — '+m.competition
    ).join('\n');

    return respond(
      selected
        ?'Posso analisar seu desempenho, ranking, seu time favorito ou um clube específico. Próximos jogos disponíveis:\n\n'+selected
        :'Não encontrei jogos na janela atual.'
    );
  }catch(e){
    if(e instanceof z.ZodError){
      return NextResponse.json({error:'Pergunta inválida.'},{status:400});
    }
    return NextResponse.json({error:'Não foi possível consultar a Arena AI agora.'},{status:500});
  }
}
