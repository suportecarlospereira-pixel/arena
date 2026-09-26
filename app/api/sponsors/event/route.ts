import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';

const Schema=z.object({
  campaignId:z.string().uuid(),
  eventType:z.enum(['impression','click']),
  placement:z.string().trim().min(1).max(50)
});

export async function POST(req:Request){
  try{
    const input=Schema.parse(await req.json());
    const s=await createClient();
    const {data:{user}}=await s.auth.getUser();

    if(!user){
      return NextResponse.json({ok:false},{status:401});
    }

    const {data,error}=await s.rpc('record_sponsor_event',{
      p_campaign_id:input.campaignId,
      p_event_type:input.eventType,
      p_placement:input.placement
    });

    if(error){
      return NextResponse.json({ok:false},{status:400});
    }

    return NextResponse.json({ok:Boolean(data)});
  }catch(e){
    if(e instanceof z.ZodError){
      return NextResponse.json({ok:false},{status:400});
    }
    return NextResponse.json({ok:false},{status:500});
  }
}
