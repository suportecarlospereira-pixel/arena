export function cn(...xs:(string|false|null|undefined)[]) { return xs.filter(Boolean).join(' '); }
export function fmtDate(iso:string) { return new Intl.DateTimeFormat('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(iso)); }
