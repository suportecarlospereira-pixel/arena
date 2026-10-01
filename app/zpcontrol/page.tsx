"use client";

import { useEffect, useMemo, useState } from "react";

type License = {
  id: string;
  key_prefix: string;
  label: string | null;
  status: "active" | "revoked";
  duration_days: number | null;
  activated_at: string | null;
  expires_at: string | null;
  device_hash: string | null;
  created_at: string;
  last_seen_at: string | null;
  validation_count: number;
};

const API = "https://jpdjwcxlxvlgqgbresae.supabase.co/functions/v1/zpcontrol";

function fmt(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

export default function ZpControlPage() {
  const [token, setToken] = useState("");
  const [licenses, setLicenses] = useState<License[]>([]);
  const [label, setLabel] = useState("");
  const [days, setDays] = useState("30");
  const [newKey, setNewKey] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("zp_admin_token") || "";
    setToken(saved);
  }, []);

  const stats = useMemo(() => {
    const active = licenses.filter((x) => x.status === "active").length;
    const blocked = licenses.filter((x) => x.status === "revoked").length;
    return { total: licenses.length, active, blocked };
  }, [licenses]);

  async function request(path: string, init: RequestInit = {}) {
    const r = await fetch(API + path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": token.trim(),
        ...(init.headers || {}),
      },
      cache: "no-store",
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || data.message || "Falha na solicitação");
    return data;
  }

  async function loginAndLoad() {
    setBusy(true);
    setMessage("");
    try {
      window.localStorage.setItem("zp_admin_token", token.trim());
      const data = await request("/admin/list");
      setLicenses(data.licenses || []);
      setMessage("Conectado ao servidor de licenças.");
    } catch (e: any) {
      setMessage(e.message || "Falha ao conectar.");
    } finally {
      setBusy(false);
    }
  }

  async function load() {
    setBusy(true);
    try {
      const data = await request("/admin/list");
      setLicenses(data.licenses || []);
    } catch (e: any) {
      setMessage(e.message || "Falha ao atualizar.");
    } finally {
      setBusy(false);
    }
  }

  async function createKey() {
    setBusy(true);
    setNewKey("");
    try {
      const data = await request("/admin/create", {
        method: "POST",
        body: JSON.stringify({
          label: label.trim() || null,
          durationDays: days === "" ? null : Number(days),
        }),
      });
      setNewKey(data.key);
      setLabel("");
      await load();
    } catch (e: any) {
      setMessage(e.message || "Falha ao gerar key.");
    } finally {
      setBusy(false);
    }
  }

  async function action(id: string, actionName: string) {
    setBusy(true);
    try {
      await request("/admin/action", {
        method: "POST",
        body: JSON.stringify({ id, action: actionName }),
      });
      await load();
    } catch (e: any) {
      setMessage(e.message || "Falha na operação.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0b0d12] text-white px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-2xl border border-white/10 bg-[#131720] p-6 shadow-2xl">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-orange-400">ZP Control</p>
              <h1 className="mt-1 text-3xl font-black">Painel de Licenças</h1>
              <p className="mt-2 text-sm text-white/55">Validação online pelo servidor • vínculo por dispositivo • expiração server-side</p>
            </div>
            <div className="text-xs text-white/40">Backend: Supabase Edge Function</div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {[
            ["Total", stats.total],
            ["Ativas", stats.active],
            ["Bloqueadas", stats.blocked],
          ].map(([name, value]) => (
            <div key={String(name)} className="rounded-2xl border border-white/10 bg-[#131720] p-5">
              <div className="text-sm text-white/50">{name}</div>
              <div className="mt-1 text-3xl font-black">{String(value)}</div>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#131720] p-5">
          <h2 className="text-lg font-bold">Acesso administrativo</h2>
          <div className="mt-4 flex flex-col gap-3 md:flex-row">
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Token administrativo"
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/25 px-4 py-3 outline-none focus:border-orange-400"
            />
            <button onClick={loginAndLoad} disabled={busy} className="rounded-xl bg-orange-500 px-5 py-3 font-bold text-black hover:bg-orange-400 disabled:opacity-50">
              Entrar / Atualizar
            </button>
          </div>
          {message && <p className="mt-3 text-sm text-white/60">{message}</p>}
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#131720] p-5">
          <h2 className="text-lg font-bold">Gerar nova key</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_190px_140px]">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Cliente / observação"
              className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 outline-none focus:border-orange-400"
            />
            <select value={days} onChange={(e) => setDays(e.target.value)} className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
              <option value="1">1 dia</option>
              <option value="7">7 dias</option>
              <option value="30">30 dias</option>
              <option value="90">90 dias</option>
              <option value="365">365 dias</option>
              <option value="">Permanente</option>
            </select>
            <button onClick={createKey} disabled={busy || !token.trim()} className="rounded-xl bg-orange-500 px-5 py-3 font-bold text-black hover:bg-orange-400 disabled:opacity-50">
              Gerar
            </button>
          </div>

          {newKey && (
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest text-emerald-300/70">Key criada</div>
                <div className="mt-1 font-mono text-lg font-bold text-emerald-300">{newKey}</div>
              </div>
              <button onClick={() => navigator.clipboard.writeText(newKey)} className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5">
                Copiar
              </button>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#131720] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">Licenças</h2>
            <button onClick={load} disabled={busy || !token.trim()} className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-50">
              Atualizar
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-white/45">
                  <th className="px-3 py-3">Key</th>
                  <th className="px-3 py-3">Cliente</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Validade</th>
                  <th className="px-3 py-3">Ativação</th>
                  <th className="px-3 py-3">Último uso</th>
                  <th className="px-3 py-3">Validações</th>
                  <th className="px-3 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {licenses.map((x) => (
                  <tr key={x.id} className="border-b border-white/5">
                    <td className="px-3 py-4 font-mono">{x.key_prefix}…</td>
                    <td className="px-3 py-4">{x.label || "—"}</td>
                    <td className="px-3 py-4">
                      <span className={x.status === "active" ? "text-emerald-400" : "text-red-400"}>
                        {x.status === "active" ? "ATIVA" : "BLOQUEADA"}
                      </span>
                    </td>
                    <td className="px-3 py-4">
                      {x.expires_at ? fmt(x.expires_at) : x.duration_days ? x.duration_days + " dias após ativar" : "Permanente"}
                    </td>
                    <td className="px-3 py-4">{fmt(x.activated_at)}</td>
                    <td className="px-3 py-4">{fmt(x.last_seen_at)}</td>
                    <td className="px-3 py-4">{x.validation_count}</td>
                    <td className="px-3 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => action(x.id, x.status === "active" ? "block" : "unblock")}
                          className="rounded-lg border border-white/10 px-3 py-2 hover:bg-white/5"
                        >
                          {x.status === "active" ? "Bloquear" : "Ativar"}
                        </button>
                        <button onClick={() => action(x.id, "reset-device")} className="rounded-lg border border-white/10 px-3 py-2 hover:bg-white/5">
                          Reset PC
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!licenses.length && (
                  <tr>
                    <td colSpan={8} className="px-3 py-10 text-center text-white/35">
                      Digite o token administrativo e clique em Entrar / Atualizar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
