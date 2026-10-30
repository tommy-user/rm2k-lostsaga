// 세이브 클라우드 동기화.
// - 플레이어가 켜지기 전에 클라우드 세이브를 플레이어의 IndexedDB(IDBFS)에 넣는다.
// - 게임이 세이브 파일을 닫으면 대기열에 넣고 upload-save 로 올린다.
// - 출처는 저장 횟수로 찾는다: 같은 플레이에서 저장 횟수가 하나 적고 플레이 시간이 더 짧은, 이미 아는 세이브.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm";
import { applyDelta } from "https://cdn.jsdelivr.net/npm/fossil-delta@2.0.0/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, BASE_SAVE } from "./config.js";
import { parseLsd } from "./lsd.js";

export const SAVE_DIR = "/easyrpg/lostsaga/Save";
const SAVE_RE = /\/Save(\d+)\.lsd$/i;
const savePath = (slot) => `${SAVE_DIR}/Save${String(slot).padStart(2, "0")}.lsd`;

// ---- IndexedDB ----

function openDb(name, version, upgrade) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = () => upgrade(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const out = fn(t.objectStore(store));
    t.oncomplete = () => resolve(out instanceof IDBRequest ? out.result : out);
    t.onerror = () => reject(t.error);
  });
}

// 플레이어(Emscripten IDBFS)와 같은 형식: 키는 전체 경로, 값은 {timestamp, mode, contents}.
const saveDb = () => openDb(SAVE_DIR, 21, (db) => {
  db.createObjectStore("FILE_DATA").createIndex("timestamp", "timestamp", { unique: false });
});
const metaDb = () => openDb("lostsaga-launcher", 1, (db) => {
  db.createObjectStore("kv");
  db.createObjectStore("pending", { autoIncrement: true });
});

// 슬롯 → {bytes, time}. time 은 마지막으로 쓴 시각.
export async function readLocalSaves() {
  const db = await saveDb();
  const out = new Map();
  await new Promise((resolve, reject) => {
    const req = db.transaction("FILE_DATA").objectStore("FILE_DATA").openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return resolve();
      const m = String(c.key).match(SAVE_RE);
      if (m && c.value?.contents) out.set(Number(m[1]), { bytes: new Uint8Array(c.value.contents), time: c.value.timestamp });
      c.continue();
    };
    req.onerror = () => reject(req.error);
  });
  db.close();
  return out;
}

async function writeLocalSave(slot, bytes, time) {
  const db = await saveDb();
  await tx(db, "FILE_DATA", "readwrite", (s) => s.put({ timestamp: time, mode: 0o100666, contents: bytes }, savePath(slot)));
  db.close();
}

// 계정이 바뀌면 이 기기의 세이브·대기열을 비운다. 다른 계정의 세이브는 새 계정에 올릴 수 없다.
async function resetLocal() {
  const db = await saveDb();
  await tx(db, "FILE_DATA", "readwrite", (s) => s.clear());
  db.close();
  const meta = await metaDb();
  await tx(meta, "pending", "readwrite", (s) => s.clear());
  await tx(meta, "kv", "readwrite", (s) => { s.delete("synced"); s.delete("rejected"); });
  meta.close();
}

async function kvGet(key) {
  const db = await metaDb();
  const v = await tx(db, "kv", "readonly", (s) => s.get(key));
  db.close();
  return v;
}

async function kvSet(key, value) {
  const db = await metaDb();
  await tx(db, "kv", "readwrite", (s) => s.put(value, key));
  db.close();
}

// ---- 바이트 도구 ----

const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const sha256 = async (b) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", b)));

async function pipe(b, t) {
  return new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(t)).arrayBuffer());
}

function base64(b) {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

// ---- 동기화 ----

export class SaveSync {
  constructor(onStatus, onSave) {
    this.onStatus = onStatus;
    this.onSave = onSave;    // 게임 안에서 새로 저장했을 때 (슬롯, 바이트)
    this.sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    this.known = new Map();  // 해시 → {run, parent, save_count, frame_count}
    this.synced = {};        // 슬롯 → 마지막으로 클라우드와 맞춘 해시
    this.busy = Promise.resolve();
    this.online = false;
  }

  status(state, text) {
    this.onStatus?.(state, text);
  }

  // 플레이어를 켜기 전에 부른다. 실패해도 게임은 로컬 세이브로 시작한다.
  async start() {
    try {
      let { data: { session } } = await this.sb.auth.getSession();
      if (session) {
        // 서버에서 지워진 계정이면 새 게스트로 시작한다. 네트워크 오류면 저장된 세션을 그대로 쓴다.
        const { error } = await this.sb.auth.getUser();
        if (error?.status >= 400 && error.status < 500) {
          await this.sb.auth.signOut({ scope: "local" });
          session = null;
        }
      }
      if (!session) {
        const { data, error } = await this.sb.auth.signInAnonymously();
        if (error) throw error;
        session = data.session;
      }
      this.user = session.user;
      // 로그인한 계정으로 들어가거나 계정에서 나올 때만 이 기기 세이브를 비운다.
      // 게스트끼리 바뀐 경우(세션을 잃음)는 이전 게스트 세이브가 여기에만 있으니 남겨 둔다.
      const owner = await kvGet("owner");
      if (owner?.id && owner.id !== this.user.id && !(owner.anonymous && this.user.is_anonymous)) await resetLocal();
      await kvSet("owner", { id: this.user.id, anonymous: !!this.user.is_anonymous });
    } catch (e) {
      console.warn("[sync]", e);
    }
    this.synced = (await kvGet("synced")) ?? {};
    this.rejected = new Set((await kvGet("rejected")) ?? []);
    try {
      if (!this.user) throw new Error("no session");
      const { error } = await this.sb.rpc("begin_session");
      if (error) throw error;
      this.online = true;
      await this.pull();
      await this.flush();
      this.status("ok", "온라인");
    } catch (e) {
      console.warn("[sync]", e);
      this.status("offline", "오프라인");
    }
  }

  // ---- 계정 ----

  get anonymous() {
    return !this.user || this.user.is_anonymous;
  }

  get accountName() {
    const m = this.user?.user_metadata ?? {};
    return m.full_name || m.name || this.user?.email || "";
  }

  // 지금 계정(게스트)에 Google 을 붙인다. 세이브는 그대로 이어진다.
  async linkGoogle(redirectTo) {
    const { error } = await this.sb.auth.linkIdentity({ provider: "google", options: { redirectTo } });
    if (error) throw error;
  }

  // Google 계정으로 들어간다. 이 기기의 게스트 세이브는 따라가지 않는다.
  async signInGoogle(redirectTo) {
    const { error } = await this.sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) throw error;
  }

  async signOut() {
    await this.sb.auth.signOut({ scope: "local" });
  }

  async baseSave() {
    if (!this.base) {
      let b = await kvGet(`base:${BASE_SAVE}`);
      if (!b) {
        const r = await fetch(`bases/${BASE_SAVE}.lsd`);
        if (!r.ok) throw new Error("base save");
        b = new Uint8Array(await r.arrayBuffer());
        await kvSet(`base:${BASE_SAVE}`, b);
      }
      this.base = b;
    }
    return this.base;
  }

  // 클라우드 세이브를 읽고, 이 기기보다 새 것은 기기에 쓴다.
  async pull() {
    const { data: rows, error } = await this.sb
      .from("save_slots").select("slot,kind,hash,run_id,game_version,delta,summary,saved_at");
    if (error) throw error;
    for (const r of rows) {
      this.known.set(r.hash.slice(2), {
        run: r.run_id, save_count: r.summary.save_count, frame_count: r.summary.frame_count,
      });
    }
    const local = await readLocalSaves();
    for (const r of rows.filter((r) => r.kind === "current")) {
      const cloudHash = r.hash.slice(2);
      const localBytes = local.get(r.slot)?.bytes;
      const localHash = localBytes ? await sha256(localBytes) : null;
      if (localHash === cloudHash) {
        this.synced[r.slot] = cloudHash;
      } else if (!localHash || localHash === this.synced[r.slot]) {
        // 이 기기에서 바뀐 적이 없으니 클라우드 쪽이 새 것이다.
        const delta = await pipe(Uint8Array.from(r.delta.slice(2).match(/../g), (h) => parseInt(h, 16)), new DecompressionStream("gzip"));
        const bytes = new Uint8Array(applyDelta(await this.baseSave(), delta));
        if (await sha256(bytes) !== cloudHash) throw new Error(`slot ${r.slot} 복원 해시 불일치`);
        await writeLocalSave(r.slot, bytes, new Date(r.saved_at));
        local.delete(r.slot);
        this.synced[r.slot] = cloudHash;
      }
      // 그 밖에는 이 기기에서 오프라인으로 저장한 것이다.
    }
    await kvSet("synced", this.synced);
    // 올리기 전에 창을 닫아 대기열에 못 들어간 세이브도 다시 넣는다.
    const queued = new Set((await this.pending()).map((p) => p.hash));
    for (const [slot, { bytes }] of local) {
      const h = await sha256(bytes);
      if (h !== this.synced[slot] && !this.rejected.has(h) && !queued.has(h)) {
        await this.enqueue(slot, bytes, false);
      }
    }
  }

  // 플레이어가 켜진 뒤 부른다. 게임이 세이브 파일을 쓰고 닫을 때마다 대기열에 넣는다.
  watch(FS) {
    const close = FS.close;
    FS.close = (stream, ...rest) => {
      const r = close.call(FS, stream, ...rest);
      try {
        const m = stream?.path?.match(SAVE_RE);
        if (m && (stream.flags & 3)) this.enqueue(Number(m[1]), FS.readFile(stream.path));
      } catch (e) {
        console.warn("[sync] watch", e);
      }
      return r;
    };
  }

  async enqueue(slot, bytes, live = true) {
    // 플레이어가 켜질 때 기기 저장소에서 파일을 채우는 것도 쓰기로 잡힌다. 이미 맞춘 세이브는 건너뛴다.
    const hash = await sha256(bytes);
    if (this.synced[slot] === hash) return;
    if (live) this.onSave?.(slot, bytes);
    const db = await metaDb();
    await tx(db, "pending", "readwrite", (s) => s.add({ slot, bytes, hash }));
    db.close();
    if (live) this.flushSoon();
  }

  async pending() {
    const db = await metaDb();
    const all = await tx(db, "pending", "readonly", (s) => s.getAll());
    db.close();
    return all;
  }

  flushSoon() {
    this.busy = this.busy.then(() => this.flush()).catch((e) => console.warn("[sync]", e));
  }

  // 대기열을 순서대로 올린다. 네트워크 오류면 멈추고 다음 기회에 다시 한다.
  async flush() {
    if (!this.online) return;
    for (;;) {
      const db = await metaDb();
      const item = await new Promise((resolve, reject) => {
        const req = db.transaction("pending").objectStore("pending").openCursor();
        req.onsuccess = () => resolve(req.result ? { key: req.result.key, ...req.result.value } : null);
        req.onerror = () => reject(req.error);
      });
      db.close();
      if (!item) return;
      this.status("busy", `슬롯 ${item.slot} 백업 중`);
      let result;
      try {
        result = await this.upload(item.slot, new Uint8Array(item.bytes));
      } catch (e) {
        console.warn("[sync] upload", e);
        this.status("offline", "오프라인 · 다음 접속 때 백업");
        return;
      }
      const db2 = await metaDb();
      await tx(db2, "pending", "readwrite", (s) => s.delete(item.key));
      db2.close();
      if (result === "ok" || result === "unchanged") {
        this.status("ok", `슬롯 ${item.slot} 백업 ${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}`);
      } else {
        // 다시 시도해도 같은 결과라 기억해 두고 다음부터 올리지 않는다.
        this.rejected.add(await sha256(new Uint8Array(item.bytes)));
        await kvSet("rejected", [...this.rejected]);
        this.status("error", `슬롯 ${item.slot} 백업 안 됨`);
      }
    }
  }

  parentOf(sum) {
    let best = null;
    for (const [hash, v] of this.known) {
      if (v.save_count === sum.save_count - 1 && v.frame_count <= sum.frame_count && (!best || v.frame_count > best.frame_count)) {
        best = { hash, ...v };
      }
    }
    return best;
  }

  async upload(slot, bytes) {
    const sum = parseLsd(bytes);
    const hash = await sha256(bytes);
    let run, parent = null;
    const seen = this.known.get(hash);
    if (seen) {
      ({ run } = seen);
      parent = seen.parent ?? null;
    } else if (sum.save_count === 1) {
      const { data, error } = await this.sb.rpc("start_run", { p_game_version: BASE_SAVE });
      if (error) throw error;
      run = data;
    } else {
      const p = this.parentOf(sum);
      if (!p) return "unknown_parent";
      run = p.run;
      parent = p.hash;
    }
    const { data: { session } } = await this.sb.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/upload-save`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        slot, run_id: run, parent_hash: parent, game_version: BASE_SAVE,
        data: base64(await pipe(bytes, new CompressionStream("gzip"))),
      }),
    });
    if (res.status >= 500 || res.status === 401) throw new Error(`upload ${res.status}`);
    const { result, error } = await res.json();
    if (result === "ok" || result === "unchanged") {
      this.known.set(hash, { run, parent, save_count: sum.save_count, frame_count: sum.frame_count });
      this.synced[slot] = hash;
      await kvSet("synced", this.synced);
    }
    return result ?? error;
  }
}
