import type { Match, RankingRow } from './types';

const teams = {
  flamengo: { id:'fla', name:'Flamengo', shortName:'FLA', crest:'🔴⚫', color:'#ef4444' },
  palmeiras: { id:'pal', name:'Palmeiras', shortName:'PAL', crest:'🟢⚪', color:'#22c55e' },
  gremio: { id:'gre', name:'Grêmio', shortName:'GRE', crest:'🔵⚫', color:'#38bdf8' },
  corinthians: { id:'cor', name:'Corinthians', shortName:'COR', crest:'⚪⚫', color:'#e2e8f0' },
  cruzeiro: { id:'cru', name:'Cruzeiro', shortName:'CRU', crest:'🔵⚪', color:'#3b82f6' },
  bahia: { id:'bah', name:'Bahia', shortName:'BAH', crest:'🔵🔴', color:'#2563eb' },
};

const today = new Date();
const at = (h:number,m:number,add=0) => { const d=new Date(today); d.setDate(d.getDate()+add); d.setHours(h,m,0,0); return d.toISOString(); };

export const demoMatches: Match[] = [
  { id:'fla-pal', competition:'Brasileirão', round:'Rodada 27', startsAt:at(21,30), status:'SCHEDULED', home:teams.flamengo, away:teams.palmeiras, venue:'Maracanã', stats:[{label:'Posse',home:'54%',away:'46%'},{label:'Finalizações',home:14,away:11},{label:'Escanteios',home:6,away:4}] },
  { id:'gre-cor', competition:'Brasileirão', round:'Rodada 27', startsAt:at(18,30), status:'SCHEDULED', home:teams.gremio, away:teams.corinthians, venue:'Arena do Grêmio' },
  { id:'cru-bah', competition:'Brasileirão', round:'Rodada 27', startsAt:at(16,0,1), status:'SCHEDULED', home:teams.cruzeiro, away:teams.bahia, venue:'Mineirão' },
];

export const ranking: RankingRow[] = [
  {position:1,username:'radar10',city:'São Paulo',state:'SP',xp:12840,level:31,accuracy:71},
  {position:2,username:'futdados',city:'Rio de Janeiro',state:'RJ',xp:12210,level:30,accuracy:69},
  {position:3,username:'mestrebola',city:'Curitiba',state:'PR',xp:11995,level:29,accuracy:72},
  {position:4,username:'scoutbr',city:'Florianópolis',state:'SC',xp:11640,level:28,accuracy:68},
  {position:5,username:'carlos',city:'Itajaí',state:'SC',xp:4820,level:14,accuracy:64},
];

export const demoUser = { name:'Carlos', username:'carlos', city:'Itajaí', state:'SC', favoriteTeam:'Flamengo', xp:4820, level:14, streak:12, bestStreak:18, accuracy:64, predictions:143, hits:92, exact:11, globalRank:14821, stateRank:742, cityRank:61 };
