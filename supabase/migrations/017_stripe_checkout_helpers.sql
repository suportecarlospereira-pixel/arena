-- Authenticated self-service helper for reusing an existing Stripe customer.

create or replace function public.get_my_billing_customer(
  p_provider text default 'stripe'
)
returns text
language plpgsql
stable
security definer
set search_path=public,pg_catalog
as $$
declare
  uid uuid:=auth.uid();
  out_customer text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_provider<>'stripe' then raise exception 'unsupported_provider'; end if;

  select external_customer_id
  into out_customer
  from public.billing_customers
  where user_id=uid and provider=p_provider
  limit 1;

  return out_customer;
end
$$;

revoke all on function public.get_my_billing_customer(text)
from public,anon;
grant execute on function public.get_my_billing_customer(text)
to authenticated;
