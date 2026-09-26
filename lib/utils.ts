export function cn(...xs:(string|false|null|undefined)[]) {
  return xs.filter(Boolean).join(' ');
}

export function fmtDate(iso:string) {
  return new Intl.DateTimeFormat('pt-BR',{
    timeZone:'America/Sao_Paulo',
    weekday:'short',
    day:'2-digit',
    month:'2-digit',
    hour:'2-digit',
    minute:'2-digit',
  }).format(new Date(iso));
}

export function dateKeySP(value:string|Date){
  return new Intl.DateTimeFormat('en-CA',{
    timeZone:'America/Sao_Paulo',
    year:'numeric',
    month:'2-digit',
    day:'2-digit',
  }).format(typeof value==='string'?new Date(value):value);
}

export function matchStatusLabel(status:string) {
  if (status === 'LIVE') return 'AO VIVO';
  if (status === 'FINISHED') return 'ENCERRADO';
  if (status === 'POSTPONED') return 'ADIADO';
  if (status === 'CANCELLED') return 'CANCELADO';
  return 'AGENDADO';
}
