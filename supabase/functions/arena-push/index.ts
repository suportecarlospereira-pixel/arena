import * as webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.49.8";

type PushSecrets={
  shared_secret:string;
  vapid_public:string;
  vapid_private:string;
};

function notificationUrl(type:string,payload:Record<string,unknown>|null){
  if(type==="match_reminder" && payload?.match_id) return "/match/"+payload.match_id;
  if(type==="prediction_result") return "/palpites";
  if(type==="social" && payload?.username) return "/u/"+payload.username;
  if(type==="referral") return "/indicacoes";
  if(type==="streak") return "/conquistas";
  return "/notificacoes";
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST") return new Response("Method not allowed",{status:405});

  try{
    const body=await req.json();
    const notificationId=String(body?.notification_id||"");
    if(!notificationId) return new Response("Missing notification_id",{status:400});

    const url=Deno.env.get("SUPABASE_URL");
    const serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!url||!serviceRole) return new Response("Server configuration error",{status:500});

    const admin=createClient(url,serviceRole,{
      auth:{persistSession:false,autoRefreshToken:false}
    });

    const {data:secretData,error:secretError}=await admin.rpc("get_push_dispatch_secrets");
    if(secretError||!secretData) return new Response("Push secrets unavailable",{status:500});

    const secrets=secretData as PushSecrets;
    const presented=req.headers.get("x-arena-push-secret")||"";
    if(!presented||presented!==secrets.shared_secret) return new Response("Unauthorized",{status:401});

    const {data:notification,error:notificationError}=await admin
      .from("notifications")
      .select("id,user_id,type,title,body,payload")
      .eq("id",notificationId)
      .single();

    if(notificationError||!notification) return new Response("Notification not found",{status:404});

    const {data:subscriptions,error:subscriptionsError}=await admin
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .eq("user_id",notification.user_id);

    if(subscriptionsError) throw subscriptionsError;
    if(!subscriptions?.length) return Response.json({ok:true,sent:0,removed:0});

    webpush.setVapidDetails(
      "https://arena-u7qy.vercel.app",
      secrets.vapid_public,
      secrets.vapid_private
    );

    const payload=JSON.stringify({
      title:notification.title,
      body:notification.body,
      icon:"/icon.svg",
      badge:"/icon.svg",
      tag:"arena-"+notification.type+"-"+notification.id,
      url:notificationUrl(notification.type,notification.payload||null)
    });

    let sent=0;
    let removed=0;

    for(const sub of subscriptions){
      try{
        await webpush.sendNotification({
          endpoint:sub.endpoint,
          keys:{p256dh:sub.p256dh,auth:sub.auth}
        },payload,{TTL:3600,urgency:"normal"});
        sent++;
      }catch(error:any){
        const status=Number(error?.statusCode||error?.status||0);
        if(status===404||status===410){
          await admin.from("push_subscriptions").delete().eq("id",sub.id);
          removed++;
        }else{
          console.error("push_send_failed",status,error?.message||String(error));
        }
      }
    }

    return Response.json({ok:true,sent,removed});
  }catch(error){
    console.error("arena_push_error",error);
    return new Response("Internal error",{status:500});
  }
});
