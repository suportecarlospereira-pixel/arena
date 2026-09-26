-- Dados esportivos não são seedados.
-- As partidas reais são sincronizadas automaticamente pelo provider esportivo.

insert into public.achievements(code,name,description,xp_reward,criteria)
values
  ('FIRST_PREDICTION','Primeiro Palpite','Faça seu primeiro palpite',50,'{"predictions":1}'),
  ('TEN_HITS','10 Acertos','Acerte 10 resultados',100,'{"hits":10}'),
  ('SEVEN_DAY_STREAK','7 Dias','Mantenha uma sequência de 7 dias',150,'{"streak":7}')
on conflict(code) do nothing;

insert into public.challenges(name,type,description,xp_reward,criteria,starts_at,ends_at)
values (
  '3 palpites hoje',
  'daily',
  'Faça 3 palpites no dia',
  100,
  '{"predictions":3}',
  date_trunc('day',now()),
  date_trunc('day',now())+interval '1 day'
);
