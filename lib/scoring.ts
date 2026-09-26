import type { MatchStatus } from './types';

export type PredictionPick='HOME'|'DRAW'|'AWAY';

export function pickFromScore(home:number,away:number):PredictionPick{
  if(home>away) return 'HOME';
  if(home<away) return 'AWAY';
  return 'DRAW';
}

export function scorePrediction(input:{
  pick:PredictionPick;
  predictedHome:number|null;
  predictedAway:number|null;
  actualHome:number;
  actualAway:number;
}){
  const correct=input.pick===pickFromScore(input.actualHome,input.actualAway);
  const exact=input.predictedHome!==null
    && input.predictedAway!==null
    && input.predictedHome===input.actualHome
    && input.predictedAway===input.actualAway;

  return {
    correct,
    exact,
    xp:(correct?20:0)+(exact?100:0)
  };
}

export function canPredict(status:MatchStatus,startsAt:string,now=new Date()){
  return status==='SCHEDULED' && new Date(startsAt).getTime()>now.getTime();
}
