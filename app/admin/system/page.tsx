import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SectionTitle } from '@/components/section-title';
import { StatCard } from '@/components/stat-card';

export const dynamic='force-dynamic';

export default async function AdminSystem(){
  const s=await createClient();
  const {data:{user}}=await s.auth.getUser();
  if(!user) redirect('/login');

  const {data:me}=await s.from('profiles').select('role').eq('id',user.id).single();
  if(!me || !['ADMIN','SUPER_ADMIN'].includes(me.role)) redirect('/');

  const {data,error}=await s.rpc('admin_system_health');
  if(error) throw error;
  const h=Array.isArray(data)?data[0]:data;

  return <div className="space-y-6">
    <SectionTitle eyebrow="Operação" title="Saúde do sistema"/>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Jogos ao vivo" value={Number(h?.live_matches??0)}/>
      <StatCard label="Agendados" value={Number(h?.scheduled_matches??0)}/>
      <StatCard label="Finais aguardando confirmação" value={Number(h?.finished_unconfirmed??0)}/>
      <StatCard label="Resultados em disputa" value={Number(h?.disputed_results??0)}/>
      <StatCard label="Falhas da fonte / 1h" value={Number(h?.provider_failures_last_hour??0)}/>
      <StatCard label="Requisições pendentes" value={Number(h?.provider_pending??0)}/>
      <StatCard label="Palpites a liquidar" value={Number(h?.pending_prediction_settlements??0)}/>
      <StatCard label="Fonte" value={h?.provider_failures_last_hour?'ATENÇÃO':'ONLINE'}/>
    </div>

    <div className="arena-card p-5 text-sm text-slate-400">
      <div><b className="text-white">Última consulta:</b> {h?.last_provider_request?new Date(h.last_provider_request).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—'}</div>
      <div className="mt-2"><b className="text-white">Último processamento sem erro:</b> {h?.last_provider_processed?new Date(h.last_provider_processed).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—'}</div>
      <p className="mt-4 text-xs leading-5 text-slate-500">Resultados só são liquidados após confirmações repetidas do mesmo placar final. Divergências ficam bloqueadas para revisão.</p>
    </div>
  </div>
}
