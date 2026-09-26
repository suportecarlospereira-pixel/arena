import {createHmac} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {canPredict,pickFromScore,scorePrediction} from '../lib/scoring';
import {verifyStripeSignature} from '../lib/billing/stripe-rest';

describe('prediction scoring',()=>{
  it('detects home, draw and away results',()=>{
    expect(pickFromScore(2,1)).toBe('HOME');
    expect(pickFromScore(1,1)).toBe('DRAW');
    expect(pickFromScore(0,3)).toBe('AWAY');
  });

  it('awards 20 XP for correct outcome without exact score',()=>{
    expect(scorePrediction({pick:'HOME',predictedHome:1,predictedAway:0,actualHome:2,actualAway:0}))
      .toEqual({correct:true,exact:false,xp:20});
  });

  it('awards 120 XP for correct exact score',()=>{
    expect(scorePrediction({pick:'DRAW',predictedHome:2,predictedAway:2,actualHome:2,actualAway:2}))
      .toEqual({correct:true,exact:true,xp:120});
  });

  it('awards no result XP for an incorrect prediction',()=>{
    expect(scorePrediction({pick:'AWAY',predictedHome:0,predictedAway:1,actualHome:2,actualAway:0}))
      .toEqual({correct:false,exact:false,xp:0});
  });

  it('only allows predictions before kickoff while scheduled',()=>{
    const future=new Date(Date.now()+60_000).toISOString();
    const past=new Date(Date.now()-60_000).toISOString();
    expect(canPredict('SCHEDULED',future)).toBe(true);
    expect(canPredict('SCHEDULED',past)).toBe(false);
    expect(canPredict('LIVE',future)).toBe(false);
    expect(canPredict('FINISHED',future)).toBe(false);
  });
});

describe('Stripe webhook verification',()=>{
  it('accepts a valid v1 signature',()=>{
    const secret='whsec_test_secret';
    const body=JSON.stringify({id:'evt_test',type:'customer.subscription.updated'});
    const timestamp=Math.floor(Date.now()/1000);
    const signature=createHmac('sha256',secret)
      .update(timestamp+'.'+body,'utf8')
      .digest('hex');

    expect(
      verifyStripeSignature(body,`t=${timestamp},v1=${signature}`,secret)
    ).toBe(true);
  });

  it('rejects a tampered payload',()=>{
    const secret='whsec_test_secret';
    const body=JSON.stringify({id:'evt_test',amount:1990});
    const timestamp=Math.floor(Date.now()/1000);
    const signature=createHmac('sha256',secret)
      .update(timestamp+'.'+body,'utf8')
      .digest('hex');

    expect(
      verifyStripeSignature(
        JSON.stringify({id:'evt_test',amount:3990}),
        `t=${timestamp},v1=${signature}`,
        secret
      )
    ).toBe(false);
  });

  it('rejects an expired signature',()=>{
    const secret='whsec_test_secret';
    const body='{}';
    const timestamp=Math.floor(Date.now()/1000)-1000;
    const signature=createHmac('sha256',secret)
      .update(timestamp+'.'+body,'utf8')
      .digest('hex');

    expect(
      verifyStripeSignature(body,`t=${timestamp},v1=${signature}`,secret)
    ).toBe(false);
  });
});
