import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';

const Schema=z.discriminatedUnion('action',[
  z.object({
    action:z.literal('create'),
    advertiserName:z.string().trim().min(2).max(100),
    name:z.string().trim().min(2).max(120),
    headline:z.string().trim().min(2).max(160),
    body:z.string().trim().max(500).optional(),
    ctaLabel:z.string().trim().min(2).max(40),
    destinationUrl:z.string().url().refine(v=>v.startsWith('https://')),
    imageUrl:z.union([z.literal(''),z.string().url().refine(v=>v.startsWith('https://'))]),
    priority:z.number().int().min(-1000).max(1000),
    startsAt:z.string().optional(),
    endsAt:z.string().optional()
  }),
  z.object({
    action:z.literal('toggle'),
    campaignId:z.string().uuid(),
    active:z.boolean()
  })
]);

export async function POST(req:Request){
  try{
    const input=Schema.parse(await req.json());
    const s=await createClient();
    const {data:{user}}=await s.auth.getUser();

    if(!user){
      return NextResponse.json({error:'Não autenticado.'},{status:401});
    }

    if(input.action==='toggle'){
      const {error}=await s.rpc('admin_set_sponsor_campaign_active',{
        p_campaign_id:input.campaignId,
        p_active:input.active
      });

      if(error){
        const status=(error.message||'').includes('forbidden')?403:500;
        return NextResponse.json({error:status===403?'Acesso negado.':'Não foi possível atualizar.'},{status});
      }

      return NextResponse.json({ok:true});
    }

    const starts=input.startsAt?new Date(input.startsAt):new Date();
    const ends=input.endsAt?new Date(input.endsAt):null;

    if(Number.isNaN(starts.getTime())||(ends&&Number.isNaN(ends.getTime()))){
      return NextResponse.json({error:'Datas inválidas.'},{status:400});
    }

    const {data,error}=await s.rpc('admin_create_sponsor_campaign',{
      p_advertiser_name:input.advertiserName,
      p_name:input.name,
      p_headline:input.headline,
      p_body:input.body||null,
      p_cta_label:input.ctaLabel,
      p_destination_url:input.destinationUrl,
      p_image_url:input.imageUrl||null,
      p_placements:['home'],
      p_priority:input.priority,
      p_starts_at:starts.toISOString(),
      p_ends_at:ends?ends.toISOString():null
    });

    if(error){
      const status=(error.message||'').includes('forbidden')?403:500;
      return NextResponse.json({error:status===403?'Acesso negado.':'Não foi possível criar a campanha.'},{status});
    }

    return NextResponse.json({ok:true,id:data});
  }catch(e){
    if(e instanceof z.ZodError){
      return NextResponse.json({error:'Verifique os dados da campanha.'},{status:400});
    }
    return NextResponse.json({error:'Erro interno.'},{status:500});
  }
}
