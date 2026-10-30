// 게임 안에서 저장할 때 런처가 보낸 세이브를 받는다.
// 원본 해시는 여기서 계산하고, 계보 검사와 슬롯 정리는 commit_save() 가 한다.
//
// POST { slot, run_id, parent_hash: hex|null, game_version, data: base64(gzip(.lsd)) }
//   → { result: "ok"|"unchanged"|<거부 사유>, hash }
import { createClient } from "@supabase/supabase-js";
import { createDelta } from "fossil-delta";
import { parseLsd } from "./lsd.ts";

const MAX_SAVE = 1 << 20;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const pgBytea = (b: Uint8Array) => "\\x" + hex(b);
const fromPgBytea = (s: string) => Uint8Array.from(s.slice(2).match(/../g) ?? [], (h) => parseInt(h, 16));

async function pipe(b: Uint8Array, t: CompressionStream | DecompressionStream, limit = Infinity) {
  const out: Uint8Array[] = [];
  let n = 0;
  for await (const c of new Blob([b]).stream().pipeThrough(t)) {
    n += c.length;
    if (n > limit) throw new Error("too large");
    out.push(c);
  }
  const r = new Uint8Array(n);
  let o = 0;
  for (const c of out) { r.set(c, o); o += c.length; }
  return r;
}

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

// 기준 세이브는 버전마다 한 번만 읽어 둔다.
const bases = new Map<string, Uint8Array>();
async function baseSave(version: string) {
  if (!bases.has(version)) {
    const { data, error } = await admin.from("base_saves").select("data").eq("game_version", version).maybeSingle();
    if (error || !data) return null;
    bases.set(version, fromPgBytea(data.data));
  }
  return bases.get(version)!;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const jwt = req.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
  const { data: auth } = await admin.auth.getUser(jwt);
  if (!auth?.user) return json({ error: "auth" }, 401);

  let body: { slot: number; run_id: string; parent_hash: string | null; game_version: string; data: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "body" }, 400);
  }
  const { slot, run_id, parent_hash, game_version } = body;
  if (!Number.isInteger(slot) || slot < 1 || slot > 99) return json({ error: "slot" }, 400);
  if (!/^[0-9a-f-]{36}$/.test(run_id ?? "")) return json({ error: "run_id" }, 400);
  if (parent_hash !== null && !/^[0-9a-f]{64}$/.test(parent_hash ?? "")) return json({ error: "parent_hash" }, 400);

  let raw: Uint8Array, summary;
  try {
    const gz = Uint8Array.from(atob(body.data), (c) => c.charCodeAt(0));
    raw = await pipe(gz, new DecompressionStream("gzip"), MAX_SAVE);
    summary = parseLsd(raw);
  } catch {
    return json({ error: "save" }, 400);
  }

  const base = await baseSave(game_version);
  if (!base) return json({ error: "game_version" }, 400);

  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", raw));
  const delta = await pipe(new Uint8Array(createDelta(base, raw)), new CompressionStream("gzip"));

  const { data: result, error } = await admin.rpc("commit_save", {
    p_user: auth.user.id,
    p_slot: slot,
    p_hash: pgBytea(hash),
    p_parent: parent_hash === null ? null : "\\x" + parent_hash,
    p_run: run_id,
    p_save_count: summary.save_count,
    p_frame_count: summary.frame_count,
    p_game_version: game_version,
    p_delta: pgBytea(delta),
    p_summary: summary,
  });
  if (error) return json({ error: "db" }, 500);
  return json({ result, hash: hex(hash) }, result === "ok" || result === "unchanged" ? 200 : 409);
});
