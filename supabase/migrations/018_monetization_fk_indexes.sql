-- Cover monetization foreign keys used by deletes and joins.

create index if not exists idx_billing_provider_prices_plan
  on public.billing_provider_prices(plan_id);

create index if not exists idx_sponsor_campaigns_created_by
  on public.sponsor_campaigns(created_by);

create index if not exists idx_sponsor_events_user
  on public.sponsor_events(user_id,event_date desc);
