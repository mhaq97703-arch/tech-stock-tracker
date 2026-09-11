import { useState, useEffect, useMemo, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Laptop, Monitor, Cable, Keyboard as KeyboardIcon, Printer, Package,
  Search, Plus, Users, History as HistoryIcon, Home, CheckCircle2, ArrowLeft, X,
  ChevronRight, Clock, Send, PackageCheck, AlertCircle, Pencil, Trash2, Lock
} from "lucide-react";

const SUPABASE_URL = "https://vitkekuojfeskeysdmff.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_VCc3blB7eiNWxZclsZCMMg_h3ywB9Ih";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CATEGORIES = ["Laptop", "Monitor", "Dock", "Keyboard & Mouse", "Zebra Printer", "Other Equipment"];

const CATEGORY_ICON = {
  Laptop, Monitor, Dock: Cable, "Keyboard & Mouse": KeyboardIcon,
  "Zebra Printer": Printer, "Other Equipment": Package,
};

function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

function emptyData() {
  return { claimed: [], spare: [], pending: [], givenOut: [] };
}

function itemLabel(rec) {
  return rec.category === "Other Equipment" ? (rec.otherName || "Item") : rec.category;
}

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
`;

export default function App() {
  const [data, setData] = useState(emptyData());
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [view, setView] = useState({ name: "dashboard" });
  const [toast, setToast] = useState(null);
  const [passwordGate, setPasswordGate] = useState(null); // { label, onConfirm } | null
  const toastTimer = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: row, error } = await supabase
          .from("stock_data")
          .select("data")
          .eq("id", 1)
          .single();
        if (error) throw error;
        if (row && row.data) {
          setData({
            claimed: row.data.claimed || [],
            spare: row.data.spare || [],
            pending: row.data.pending || [],
            givenOut: row.data.givenOut || [],
          });
        }
      } catch (e) {
        console.error("Failed to load stock data", e);
        // start fresh if the row can't be read yet
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  function showToast(msg) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }

  function persist(next) {
    setData(next);
    supabase
      .from("stock_data")
      .update({ data: next, updated_at: new Date().toISOString() })
      .eq("id", 1)
      .then(({ error }) => {
        if (error) throw error;
        setSaveError(false);
      })
      .catch(() => { setSaveError(true); showToast("Couldn't save — check your connection"); });
  }

  // ---------- mutations ----------
  function addStock({ category, otherName, quantity, status, person }) {
    const otherKey = category === "Other Equipment" ? (otherName || "").trim() : "";
    const next = {
      claimed: [...data.claimed],
      spare: [...data.spare],
      pending: [...data.pending],
      givenOut: [...data.givenOut],
    };
    if (status === "claimed" || status === "pending") {
      const arr = status === "claimed" ? next.claimed : next.pending;
      const idx = arr.findIndex(r => r.category === category && r.otherName === otherKey && r.person.toLowerCase() === person.toLowerCase());
      if (idx >= 0) arr[idx] = { ...arr[idx], quantity: arr[idx].quantity + quantity };
      else arr.push({ id: uid(), category, otherName: otherKey, person: person.trim(), quantity });
    } else {
      const idx = next.spare.findIndex(r => r.category === category && r.otherName === otherKey);
      if (idx >= 0) next.spare[idx] = { ...next.spare[idx], quantity: next.spare[idx].quantity + quantity };
      else next.spare.push({ id: uid(), category, otherName: otherKey, quantity });
    }
    persist(next);
    showToast(`Added ${quantity} × ${otherKey || category} to stock`);
  }

  function markReceived(pendingId) {
    const rec = data.pending.find(r => r.id === pendingId);
    if (!rec) return;
    const pending = data.pending.filter(r => r.id !== pendingId);
    const claimed = [...data.claimed];
    const idx = claimed.findIndex(r => r.category === rec.category && r.otherName === rec.otherName && r.person.toLowerCase() === rec.person.toLowerCase());
    if (idx >= 0) claimed[idx] = { ...claimed[idx], quantity: claimed[idx].quantity + rec.quantity };
    else claimed.push({ ...rec });
    persist({ ...data, pending, claimed });
    showToast(`Marked ${itemLabel(rec)} as received for ${rec.person}`);
  }

  function giveOutClaimed(ids) {
    const givenOut = [...data.givenOut];
    const claimed = data.claimed.filter(r => {
      if (ids.includes(r.id)) {
        givenOut.push({ id: uid(), person: r.person, category: r.category, otherName: r.otherName, quantity: r.quantity });
        return false;
      }
      return true;
    });
    persist({ ...data, claimed, givenOut });
    showToast("Items given out");
  }

  function giveOutSpare({ category, otherName, quantity, person }) {
    const otherKey = category === "Other Equipment" ? (otherName || "").trim() : "";
    const spare = [...data.spare];
    const idx = spare.findIndex(r => r.category === category && r.otherName === otherKey);
    if (idx < 0 || spare[idx].quantity < quantity) {
      showToast("Not enough spare stock");
      return false;
    }
    spare[idx] = { ...spare[idx], quantity: spare[idx].quantity - quantity };
    const filtered = spare.filter(r => r.quantity > 0);
    const givenOut = [...data.givenOut, { id: uid(), person: person.trim(), category, otherName: otherKey, quantity }];
    persist({ ...data, spare: filtered, givenOut });
    showToast(`Gave ${quantity} × ${otherKey || category} to ${person}`);
    return true;
  }

  function requestPassword(label, onConfirm) {
    setPasswordGate({ label, onConfirm });
  }

  function updateRecord(listKey, id, updates) {
    const list = data[listKey]
      .map(r => (r.id === id ? { ...r, ...updates } : r))
      .filter(r => r.quantity > 0);
    persist({ ...data, [listKey]: list });
    showToast("Updated");
  }

  function deleteRecordFn(listKey, id) {
    const list = data[listKey].filter(r => r.id !== id);
    persist({ ...data, [listKey]: list });
    showToast("Deleted");
  }

  function resetAll() {
    persist(emptyData());
    showToast("All data cleared");
  }

  // ---------- derived ----------
  const totals = useMemo(() => {
    const t = {};
    CATEGORIES.forEach(cat => {
      const claimedQty = data.claimed.filter(r => r.category === cat).reduce((s, r) => s + r.quantity, 0);
      const spareQty = data.spare.filter(r => r.category === cat).reduce((s, r) => s + r.quantity, 0);
      t[cat] = { claimedQty, spareQty, total: claimedQty + spareQty };
    });
    return t;
  }, [data]);

  const allPeople = useMemo(() => {
    const set = new Set();
    data.claimed.forEach(r => set.add(r.person));
    data.pending.forEach(r => set.add(r.person));
    data.givenOut.forEach(r => set.add(r.person));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data]);

  const peopleWithItemsHere = useMemo(() => {
    const map = {};
    data.claimed.forEach(r => { map[r.person] = (map[r.person] || 0) + r.quantity; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [data]);

  const otherNames = useMemo(() => {
    const set = new Set();
    data.claimed.forEach(r => { if (r.category === "Other Equipment" && r.otherName) set.add(r.otherName); });
    data.spare.forEach(r => { if (r.category === "Other Equipment" && r.otherName) set.add(r.otherName); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data]);

  function goto(v) { setView(v); }

  function handleSearch(raw) {
    const q = raw.trim();
    if (!q) return;
    const lower = q.toLowerCase();
    const catMatch = CATEGORIES.find(c => c.toLowerCase() === lower) ||
      CATEGORIES.find(c => c.toLowerCase().includes(lower) || lower.includes(c.toLowerCase()));
    if (catMatch) { goto({ name: "category", category: catMatch }); return; }
    const nameMatch = otherNames.find(n => n.toLowerCase().includes(lower));
    if (nameMatch) { goto({ name: "category", category: "Other Equipment", focusName: nameMatch }); return; }
    const personMatch = allPeople.find(p => p.toLowerCase() === lower) || allPeople.find(p => p.toLowerCase().includes(lower));
    goto({ name: "person", person: personMatch || q });
  }

  const vars = {
    "--bg": "#F3F6FC", "--panel": "#FFFFFF", "--ink": "#001E5F", "--ink-soft": "#5C6B85",
    "--border": "#D6E1F5", "--claimed": "#001E5F", "--claimed-soft": "#DCE6F7",
    "--spare": "#2F6FB0", "--spare-soft": "#E4EEFB", "--danger": "#B23B3B", "--danger-soft": "#F5DEDE",
    "--neutral-soft": "#E8EEF7",
    "--font-display": "'Space Grotesk', sans-serif", "--font-body": "'Inter', sans-serif",
    "--font-mono": "'IBM Plex Mono', monospace",
  };

  if (!loaded) {
    return (
      <div style={{ ...vars, background: "var(--bg)", fontFamily: "var(--font-body)" }} className="min-h-screen flex items-center justify-center">
        <style>{FONTS}</style>
        <div style={{ color: "var(--ink-soft)" }} className="text-sm">Loading stock data…</div>
      </div>
    );
  }

  return (
    <div style={{ ...vars, background: "var(--bg)", fontFamily: "var(--font-body)", color: "var(--ink)" }} className="min-h-screen">
      <style>{`
        ${FONTS}
        .tag-card { position: relative; background: var(--panel); border: 1px solid var(--border); border-radius: 14px; transition: transform .12s ease, box-shadow .12s ease; }
        .tag-card:hover { transform: translateY(-2px); box-shadow: 0 8px 20px -10px rgba(34,37,31,0.25); }
        .tag-notch { position: absolute; top: 14px; left: 14px; width: 10px; height: 10px; border-radius: 999px; background: var(--bg); border: 1px solid var(--border); }
        .dashed-div { border-top: 1.5px dashed var(--border); }
        .mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
        .display { font-family: var(--font-display); }
        .btn-primary { background: var(--ink); color: var(--bg); font-family: var(--font-display); }
        .btn-primary:hover { opacity: .88; }
        .btn-outline { background: transparent; border: 1.5px solid var(--ink); color: var(--ink); font-family: var(--font-display); }
        .btn-outline:hover { background: var(--ink); color: var(--bg); }
        .chip-claimed { background: var(--claimed-soft); color: var(--claimed); }
        .chip-spare { background: var(--spare-soft); color: var(--spare); }
        .chip-pending { background: var(--neutral-soft); color: var(--ink-soft); }
        input[type=text], input[type=number], select, textarea {
          background: var(--panel); border: 1.5px solid var(--border); color: var(--ink); font-family: var(--font-body);
        }
        input:focus, select:focus, textarea:focus { outline: none; border-color: var(--ink); }
        .navbtn { font-family: var(--font-display); }
        .navbtn.active { background: var(--ink); color: var(--bg); }
        .icon-btn { color: var(--ink-soft); border-radius: 8px; padding: 5px; }
        .icon-btn:hover { background: var(--neutral-soft); }
        .icon-btn.danger:hover { background: var(--danger-soft); color: var(--danger); }
        button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible {
          outline: 2.5px solid var(--spare); outline-offset: 2px;
        }
      `}</style>

      <TopNav view={view} goto={goto} />

      <main className="max-w-5xl mx-auto px-5 pb-24 pt-6">
        {view.name === "dashboard" && (
          <Dashboard totals={totals} goto={goto} handleSearch={handleSearch} peopleWithItemsHere={peopleWithItemsHere}
            onRequestReset={() => requestPassword("Clear All Data", resetAll)} />
        )}
        {view.name === "receive" && <ReceiveStock addStock={addStock} otherNames={otherNames} />}
        {view.name === "people" && <PeopleList allPeople={allPeople} peopleWithItemsHere={peopleWithItemsHere} goto={goto} />}
        {view.name === "giveout" && (
          <GiveOut data={data} allPeople={allPeople} giveOutClaimed={giveOutClaimed} giveOutSpare={giveOutSpare} presetPerson={view.person} goto={goto} />
        )}
        {view.name === "history" && (
          <HistoryPage givenOut={data.givenOut} updateRecord={updateRecord} deleteRecordFn={deleteRecordFn} requestPassword={requestPassword} />
        )}
        {view.name === "category" && (
          <CategoryPage category={view.category} focusName={view.focusName} data={data} totals={totals} goto={goto}
            updateRecord={updateRecord} deleteRecordFn={deleteRecordFn} requestPassword={requestPassword} />
        )}
        {view.name === "person" && (
          <PersonPage name={view.person} data={data} goto={goto} markReceived={markReceived} addStock={addStock} otherNames={otherNames}
            updateRecord={updateRecord} deleteRecordFn={deleteRecordFn} requestPassword={requestPassword} />
        )}
      </main>

      {passwordGate && (
        <PasswordModal gate={passwordGate} onClose={() => setPasswordGate(null)} />
      )}

      {toast && (
        <div role="status" aria-live="polite" className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-full shadow-lg text-sm z-50"
          style={{ background: "var(--ink)", color: "var(--bg)", fontFamily: "var(--font-body)" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ================= PASSWORD MODAL =================
function PasswordModal({ gate, onClose }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  function submit(e) {
    e.preventDefault();
    if (pin === "0000") {
      gate.onConfirm();
      onClose();
    } else {
      setError("Incorrect password.");
      setPin("");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,30,95,0.45)" }}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="password-modal-title"
        className="w-full max-w-xs rounded-2xl p-5 flex flex-col gap-3 shadow-xl"
        style={{ background: "var(--panel)", border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2">
          <Lock size={16} style={{ color: "var(--ink)" }} />
          <h3 id="password-modal-title" className="display font-bold text-base">{gate.label}</h3>
        </div>
        <p className="text-xs" style={{ color: "var(--ink-soft)" }}>Enter the password to continue.</p>
        <input type="password" inputMode="numeric" autoFocus value={pin} aria-label="Password"
          onChange={e => { setPin(e.target.value); setError(""); }}
          className="w-full px-3 py-2.5 rounded-lg text-center tracking-[0.4em] text-lg" placeholder="••••" />
        {error && <div role="alert" className="text-xs flex items-center gap-1.5" style={{ color: "var(--danger)" }}><AlertCircle size={13} /> {error}</div>}
        <div className="flex gap-2 mt-1">
          <button type="submit" className="btn-primary flex-1 py-2.5 rounded-lg font-semibold">Confirm</button>
          <button type="button" onClick={onClose} className="btn-outline px-4 py-2.5 rounded-lg font-semibold">Cancel</button>
        </div>
      </form>
    </div>
  );
}

// ================= NAV =================
function TopNav({ view, goto }) {
  const items = [
    { key: "dashboard", label: "Dashboard", icon: Home },
    { key: "receive", label: "Receive Stock", icon: Plus },
    { key: "people", label: "People", icon: Users },
    { key: "giveout", label: "Give Out", icon: Send },
    { key: "history", label: "History", icon: HistoryIcon },
  ];
  return (
    <div style={{ borderBottom: "1px solid var(--border)", background: "var(--panel)" }} className="sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="display text-lg font-bold tracking-tight flex items-center gap-2" style={{ color: "var(--ink)" }} onClick={() => goto({ name: "dashboard" })}>
          <img src="/uor-logo.png" alt="" aria-hidden="true" style={{ height: 26, width: "auto" }}
            onError={(e) => { e.currentTarget.style.display = "none"; }} />
          <span className="cursor-pointer">UOR TECH SUPPLIES</span>
        </div>
        <nav className="flex gap-1 flex-wrap">
          {items.map(it => (
            <button key={it.key} onClick={() => goto({ name: it.key })}
              className={`navbtn flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${view.name === it.key ? "active" : ""}`}
              style={view.name !== it.key ? { color: "var(--ink-soft)" } : {}}>
              <it.icon size={14} /> {it.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

// ================= DASHBOARD =================
function Dashboard({ totals, goto, handleSearch, peopleWithItemsHere, onRequestReset }) {
  const [q, setQ] = useState("");

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-2 mb-5">
        <button onClick={() => goto({ name: "receive" })} className="btn-primary px-5 py-3 rounded-xl font-semibold flex items-center gap-2 justify-center">
          <Plus size={18} /> Receive Stock
        </button>
        <button onClick={() => goto({ name: "giveout" })} className="btn-outline px-5 py-3 rounded-xl font-semibold flex items-center gap-2 justify-center">
          <Send size={16} /> Give Out Item
        </button>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); handleSearch(q); }} className="mb-8">
        <div className="relative">
          <Search size={18} style={{ color: "var(--ink-soft)" }} className="absolute left-4 top-1/2 -translate-y-1/2" />
          <input type="text" value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search person or equipment…" aria-label="Search person or equipment"
            className="w-full pl-11 pr-4 py-3.5 rounded-xl text-base" />
        </div>
      </form>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">
        {CATEGORIES.map(cat => (
          <CategoryCard key={cat} category={cat} stats={totals[cat]} onClick={() => goto({ name: "category", category: cat })} />
        ))}
      </div>

      <div>
        <h2 className="display font-bold text-sm tracking-wide uppercase mb-3" style={{ color: "var(--ink-soft)" }}>People With Items Here</h2>
        {peopleWithItemsHere.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Nobody has claimed items in stock right now.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {peopleWithItemsHere.map(([name, qty]) => (
              <button key={name} onClick={() => goto({ name: "person", person: name })}
                className="tag-card flex items-center justify-between px-4 py-2.5 text-left">
                <span className="font-medium">{name}</span>
                <span className="flex items-center gap-1 text-sm mono" style={{ color: "var(--ink-soft)" }}>
                  {qty} item{qty === 1 ? "" : "s"} <ChevronRight size={15} />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-14 text-right">
        <button onClick={onRequestReset} className="text-xs underline flex items-center gap-1 ml-auto" style={{ color: "var(--ink-soft)" }}>
          <Lock size={11} /> Reset all data
        </button>
      </div>
    </div>
  );
}

function CategoryCard({ category, stats, onClick }) {
  const Icon = CATEGORY_ICON[category];
  return (
    <button onClick={onClick} className="tag-card text-left p-4 pt-5 flex flex-col gap-3">
      <span className="tag-notch" />
      <div className="flex items-center gap-2 pl-3">
        <Icon size={18} style={{ color: "var(--ink)" }} />
        <span className="display font-semibold text-sm">{category}</span>
      </div>
      <div className="pl-3">
        <div className="mono text-3xl font-semibold leading-none">{stats.total}</div>
        <div className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>Total in stock</div>
      </div>
      <div className="dashed-div pt-2.5 flex gap-2 pl-3">
        <span className="chip-claimed text-xs font-semibold px-2 py-1 rounded-full mono">{stats.claimedQty} claimed</span>
        <span className="chip-spare text-xs font-semibold px-2 py-1 rounded-full mono">{stats.spareQty} spare</span>
      </div>
    </button>
  );
}

// ================= RECEIVE STOCK =================
function ReceiveStock({ addStock, otherNames }) {
  const [category, setCategory] = useState("Laptop");
  const [otherName, setOtherName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState("claimed");
  const [person, setPerson] = useState("");
  const [err, setErr] = useState("");

  function submit(e) {
    e.preventDefault();
    const qty = parseInt(quantity, 10);
    if (!qty || qty < 1) { setErr("Enter a quantity of at least 1."); return; }
    if (category === "Other Equipment" && !otherName.trim()) { setErr("Enter what the item is."); return; }
    if ((status === "claimed" || status === "pending") && !person.trim()) { setErr("Enter who this is for."); return; }
    setErr("");
    addStock({ category, otherName, quantity: qty, status, person });
    setQuantity(1);
    if (status !== "pending") setPerson(status === "claimed" ? person : "");
    setOtherName("");
  }

  return (
    <div className="max-w-lg">
      <h1 className="display text-2xl font-bold mb-6">Receive Stock</h1>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-soft)" }}>Equipment Type</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
            {CATEGORIES.map(cat => {
              const Icon = CATEGORY_ICON[cat];
              return (
                <button type="button" key={cat} onClick={() => setCategory(cat)}
                  className="tag-card flex items-center gap-2 px-3 py-2.5 text-sm font-medium"
                  style={category === cat ? { borderColor: "var(--ink)", background: "var(--claimed-soft)" } : {}}>
                  <Icon size={15} /> {cat}
                </button>
              );
            })}
          </div>
        </div>

        {category === "Other Equipment" && (
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-soft)" }}>Equipment Name</label>
            <input type="text" list="other-names" value={otherName} onChange={e => setOtherName(e.target.value)}
              placeholder="e.g. USB-C Charger" className="w-full mt-1.5 px-3.5 py-2.5 rounded-lg" />
            <datalist id="other-names">{otherNames.map(n => <option key={n} value={n} />)}</datalist>
          </div>
        )}

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-soft)" }}>Quantity</label>
          <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)}
            className="w-full mt-1.5 px-3.5 py-2.5 rounded-lg" />
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-soft)" }}>Who is this stock for?</label>
          <div className="flex gap-2 mt-2">
            {[
              { key: "claimed", label: "Claimed" },
              { key: "spare", label: "Spare" },
              { key: "pending", label: "Expected (not here yet)" },
            ].map(opt => (
              <button type="button" key={opt.key} onClick={() => setStatus(opt.key)}
                className="px-3.5 py-2 rounded-lg text-sm font-semibold tag-card"
                style={status === opt.key ? { borderColor: "var(--ink)", background: opt.key === "spare" ? "var(--spare-soft)" : "var(--claimed-soft)" } : {}}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {(status === "claimed" || status === "pending") && (
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-soft)" }}>Employee Name</label>
            <input type="text" value={person} onChange={e => setPerson(e.target.value)}
              placeholder="e.g. Trevor Smith" className="w-full mt-1.5 px-3.5 py-2.5 rounded-lg" />
          </div>
        )}

        {err && <div className="text-sm flex items-center gap-1.5" style={{ color: "var(--danger)" }}><AlertCircle size={14} /> {err}</div>}

        <button type="submit" className="btn-primary py-3 rounded-xl font-semibold mt-1">Add Stock</button>
      </form>
    </div>
  );
}

// ================= PEOPLE =================
function PeopleList({ allPeople, peopleWithItemsHere, goto }) {
  const [q, setQ] = useState("");
  const hereMap = Object.fromEntries(peopleWithItemsHere);
  const filtered = allPeople.filter(p => p.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <h1 className="display text-2xl font-bold mb-5">People</h1>
      <div className="flex gap-2 mb-6">
        <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Find or add a person…"
          className="flex-1 px-3.5 py-2.5 rounded-lg" />
        <button onClick={() => q.trim() && goto({ name: "person", person: q.trim() })} className="btn-outline px-4 rounded-lg font-semibold">Open</button>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>No people found yet. Receive claimed stock for someone to add them here.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {filtered.map(name => (
            <button key={name} onClick={() => goto({ name: "person", person: name })} className="tag-card flex items-center justify-between px-4 py-3 text-left">
              <span className="font-medium">{name}</span>
              <span className="text-sm mono flex items-center gap-1" style={{ color: "var(--ink-soft)" }}>
                {hereMap[name] || 0} here <ChevronRight size={15} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ================= GIVE OUT =================
function GiveOut({ data, allPeople, giveOutClaimed, giveOutSpare, presetPerson, goto }) {
  const [person, setPerson] = useState(presetPerson || "");
  const [active, setActive] = useState(presetPerson || "");
  const [selected, setSelected] = useState([]);
  const [spareCategory, setSpareCategory] = useState("Laptop");
  const [spareOtherName, setSpareOtherName] = useState("");
  const [spareQty, setSpareQty] = useState(1);
  const [err, setErr] = useState("");

  const claimedForPerson = active ? data.claimed.filter(r => r.person.toLowerCase() === active.toLowerCase()) : [];

  const spareOtherOptions = Array.from(new Set(data.spare.filter(r => r.category === "Other Equipment").map(r => r.otherName)));
  const availableSpare = (() => {
    const key = spareCategory === "Other Equipment" ? spareOtherName : "";
    const rec = data.spare.find(r => r.category === spareCategory && r.otherName === key);
    return rec ? rec.quantity : 0;
  })();

  function load() {
    if (!person.trim()) return;
    setActive(person.trim());
    setSelected([]);
  }

  function toggle(id) {
    setSelected(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);
  }

  function submitClaimed() {
    if (selected.length === 0) return;
    giveOutClaimed(selected);
    setSelected([]);
  }

  function submitSpare(e) {
    e.preventDefault();
    if (!active.trim()) { setErr("Enter who this is for first."); return; }
    const qty = parseInt(spareQty, 10);
    if (!qty || qty < 1) { setErr("Enter a valid quantity."); return; }
    if (spareCategory === "Other Equipment" && !spareOtherName) { setErr("Choose which spare item."); return; }
    if (qty > availableSpare) { setErr(`Only ${availableSpare} available in spare stock.`); return; }
    setErr("");
    const ok = giveOutSpare({ category: spareCategory, otherName: spareOtherName, quantity: qty, person: active });
    if (ok) setSpareQty(1);
  }

  return (
    <div className="max-w-xl">
      <h1 className="display text-2xl font-bold mb-5">Give Out</h1>

      <div className="flex gap-2 mb-2">
        <input type="text" list="giveout-people" value={person} onChange={e => setPerson(e.target.value)}
          placeholder="Search or enter person's name…" className="flex-1 px-3.5 py-2.5 rounded-lg"
          onKeyDown={e => e.key === "Enter" && (e.preventDefault(), load())} />
        <datalist id="giveout-people">{allPeople.map(p => <option key={p} value={p} />)}</datalist>
        <button onClick={load} className="btn-primary px-4 rounded-lg font-semibold">Load</button>
      </div>

      {active && (
        <>
          <h2 className="display font-bold text-sm uppercase tracking-wide mt-8 mb-3" style={{ color: "var(--ink-soft)" }}>
            Claimed Items Waiting — {active}
          </h2>
          {claimedForPerson.length === 0 ? (
            <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>Nothing claimed and waiting for {active}.</p>
          ) : (
            <div className="flex flex-col gap-2 mb-4">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={selected.length === claimedForPerson.length}
                  onChange={e => setSelected(e.target.checked ? claimedForPerson.map(r => r.id) : [])} />
                Select All
              </label>
              {claimedForPerson.map(r => (
                <label key={r.id} className="tag-card flex items-center justify-between px-4 py-2.5">
                  <span className="flex items-center gap-2">
                    <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} />
                    {itemLabel(r)}
                  </span>
                  <span className="mono chip-claimed text-xs font-semibold px-2 py-1 rounded-full">×{r.quantity}</span>
                </label>
              ))}
              <button onClick={submitClaimed} disabled={selected.length === 0}
                className="btn-primary py-2.5 rounded-xl font-semibold mt-1 disabled:opacity-40">
                Give Out Selected Items
              </button>
            </div>
          )}

          <h2 className="display font-bold text-sm uppercase tracking-wide mt-8 mb-3" style={{ color: "var(--ink-soft)" }}>
            Give From Spare Stock
          </h2>
          <form onSubmit={submitSpare} className="tag-card p-4 flex flex-col gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-soft)" }}>Equipment</label>
              <select value={spareCategory} onChange={e => { setSpareCategory(e.target.value); setSpareOtherName(""); }}
                className="w-full mt-1.5 px-3 py-2 rounded-lg">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {spareCategory === "Other Equipment" && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-soft)" }}>Item</label>
                <select value={spareOtherName} onChange={e => setSpareOtherName(e.target.value)} className="w-full mt-1.5 px-3 py-2 rounded-lg">
                  <option value="">Choose an item…</option>
                  {spareOtherOptions.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            )}
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-soft)" }}>Quantity</label>
              <span className="text-xs mono" style={{ color: "var(--ink-soft)" }}>{availableSpare} available</span>
            </div>
            <input type="number" min="1" value={spareQty} onChange={e => setSpareQty(e.target.value)} className="w-full px-3 py-2 rounded-lg" />
            {err && <div className="text-sm flex items-center gap-1.5" style={{ color: "var(--danger)" }}><AlertCircle size={14} /> {err}</div>}
            <button type="submit" className="btn-outline py-2.5 rounded-xl font-semibold">Give Out</button>
          </form>
        </>
      )}
    </div>
  );
}

// ================= HISTORY =================
function HistoryPage({ givenOut, updateRecord, deleteRecordFn, requestPassword }) {
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [draftQty, setDraftQty] = useState("");
  const filtered = givenOut.filter(r => {
    if (!q.trim()) return true;
    const lower = q.toLowerCase();
    return r.person.toLowerCase().includes(lower) || itemLabel(r).toLowerCase().includes(lower);
  });
  return (
    <div>
      <h1 className="display text-2xl font-bold mb-5">Given-Out History</h1>
      <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by person or equipment…"
        className="w-full px-3.5 py-2.5 rounded-lg mb-5" />
      {filtered.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>No given-out equipment matches yet.</p>
      ) : (
        <div className="tag-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="dashed-div text-left" style={{ color: "var(--ink-soft)" }}>
                <th className="px-4 py-2.5 font-semibold text-xs uppercase tracking-wide">Person</th>
                <th className="px-4 py-2.5 font-semibold text-xs uppercase tracking-wide">Equipment</th>
                <th className="px-4 py-2.5 font-semibold text-xs uppercase tracking-wide text-right">Quantity</th>
                <th className="px-4 py-2.5 font-semibold text-xs uppercase tracking-wide text-right">Fix</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice().reverse().map(r => (
                <tr key={r.id} className="dashed-div">
                  <td className="px-4 py-2.5 font-medium">{r.person}</td>
                  <td className="px-4 py-2.5">{itemLabel(r)}</td>
                  <td className="px-4 py-2.5 text-right mono">
                    {editingId === r.id ? (
                      <input type="number" min="1" value={draftQty} onChange={e => setDraftQty(e.target.value)}
                        aria-label={`New quantity for ${itemLabel(r)} given to ${r.person}`}
                        className="w-16 px-2 py-1 rounded-lg text-sm text-center" autoFocus />
                    ) : r.quantity}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {editingId === r.id ? (
                      <span className="inline-flex items-center gap-1.5">
                        <button onClick={() => {
                          const qty = parseInt(draftQty, 10);
                          if (qty > 0) updateRecord("givenOut", r.id, { quantity: qty });
                          setEditingId(null);
                        }} className="btn-primary text-xs px-2.5 py-1.5 rounded-lg font-semibold">Save</button>
                        <button onClick={() => setEditingId(null)} className="btn-outline text-xs px-2.5 py-1.5 rounded-lg font-semibold">Cancel</button>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <button onClick={() => requestPassword("Edit Item", () => { setEditingId(r.id); setDraftQty(String(r.quantity)); })}
                          aria-label={`Edit quantity for ${itemLabel(r)} given to ${r.person}`} title="Edit quantity" className="icon-btn"><Pencil size={13} /></button>
                        <button onClick={() => requestPassword("Delete Item", () => deleteRecordFn("givenOut", r.id))}
                          aria-label={`Delete ${itemLabel(r)} given to ${r.person}`} title="Delete" className="icon-btn danger"><Trash2 size={13} /></button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ================= ITEM ROW (edit / delete) =================
function ItemRow({ label, onClickLabel, quantity, chipClass, editing, draftQty, onDraftChange, onEdit, onDelete, onSave, onCancel }) {
  if (editing) {
    return (
      <div className="tag-card flex items-center justify-between px-4 py-2.5 gap-2">
        <span className="font-medium truncate">{label}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          <input type="number" min="1" value={draftQty} onChange={e => onDraftChange(e.target.value)}
            aria-label={`New quantity for ${label}`}
            className="w-16 px-2 py-1.5 rounded-lg text-sm text-center" autoFocus />
          <button onClick={onSave} className="btn-primary text-xs px-2.5 py-1.5 rounded-lg font-semibold">Save</button>
          <button onClick={onCancel} className="btn-outline text-xs px-2.5 py-1.5 rounded-lg font-semibold">Cancel</button>
        </div>
      </div>
    );
  }
  return (
    <div className="tag-card flex items-center justify-between px-4 py-2.5 gap-2">
      {onClickLabel ? (
        <button onClick={onClickLabel} className="font-medium truncate text-left hover:underline">{label}</button>
      ) : (
        <span className="font-medium truncate">{label}</span>
      )}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={`mono ${chipClass} text-xs font-semibold px-2 py-1 rounded-full`}>×{quantity}</span>
        <button onClick={onEdit} aria-label={`Edit quantity for ${label}`} title="Edit quantity" className="icon-btn"><Pencil size={13} /></button>
        <button onClick={onDelete} aria-label={`Delete ${label}`} title="Delete" className="icon-btn danger"><Trash2 size={13} /></button>
      </div>
    </div>
  );
}

// ================= CATEGORY PAGE =================
function CategoryPage({ category, focusName, data, totals, goto, updateRecord, deleteRecordFn, requestPassword }) {
  const Icon = CATEGORY_ICON[category];
  const [editingId, setEditingId] = useState(null);
  const [draftQty, setDraftQty] = useState("");
  const [editingSpare, setEditingSpare] = useState(false);
  const [draftSpareQty, setDraftSpareQty] = useState("");

  if (category === "Other Equipment" && !focusName) {
    const names = Array.from(new Set([
      ...data.claimed.filter(r => r.category === "Other Equipment").map(r => r.otherName),
      ...data.spare.filter(r => r.category === "Other Equipment").map(r => r.otherName),
    ])).sort((a, b) => a.localeCompare(b));

    return (
      <div>
        <BackBtn goto={goto} />
        <div className="flex items-center gap-2 mb-1"><Icon size={20} /><h1 className="display text-2xl font-bold">Other Equipment</h1></div>
        <p className="mono text-lg mb-6" style={{ color: "var(--ink-soft)" }}>{totals["Other Equipment"].total} Total</p>
        {names.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>No other equipment in stock yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {names.map(n => {
              const c = data.claimed.filter(r => r.otherName === n).reduce((s, r) => s + r.quantity, 0);
              const s = data.spare.filter(r => r.otherName === n).reduce((s2, r) => s2 + r.quantity, 0);
              return (
                <button key={n} onClick={() => goto({ name: "category", category: "Other Equipment", focusName: n })}
                  className="tag-card flex items-center justify-between px-4 py-3 text-left">
                  <span className="font-medium">{n}</span>
                  <span className="flex items-center gap-2 text-xs mono">
                    <span className="chip-claimed px-2 py-1 rounded-full font-semibold">{c} claimed</span>
                    <span className="chip-spare px-2 py-1 rounded-full font-semibold">{s} spare</span>
                    <ChevronRight size={15} style={{ color: "var(--ink-soft)" }} />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const claimedRecs = data.claimed.filter(r => r.category === category && (category !== "Other Equipment" || r.otherName === focusName));
  const spareRecs = data.spare.filter(r => r.category === category && (category !== "Other Equipment" || r.otherName === focusName));
  const spareRec = spareRecs[0] || null;
  const spareQty = spareRecs.reduce((s, r) => s + r.quantity, 0);
  const claimedQty = claimedRecs.reduce((s, r) => s + r.quantity, 0);
  const title = category === "Other Equipment" ? focusName : category;

  return (
    <div>
      <BackBtn goto={goto} onClick={category === "Other Equipment" ? () => goto({ name: "category", category: "Other Equipment" }) : undefined} />
      <div className="flex items-center gap-2 mb-1"><Icon size={20} /><h1 className="display text-2xl font-bold">{title}</h1></div>
      <p className="mono text-lg mb-6" style={{ color: "var(--ink-soft)" }}>{claimedQty + spareQty} Total in Stock</p>

      <h2 className="display font-bold text-sm uppercase tracking-wide mb-2" style={{ color: "var(--ink-soft)" }}>Claimed — {claimedQty}</h2>
      {claimedRecs.length === 0 ? (
        <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>No claimed items.</p>
      ) : (
        <div className="flex flex-col gap-1.5 mb-6">
          {claimedRecs.map(r => (
            <ItemRow key={r.id}
              label={r.person}
              onClickLabel={() => goto({ name: "person", person: r.person })}
              quantity={r.quantity}
              chipClass="chip-claimed"
              editing={editingId === r.id}
              draftQty={draftQty}
              onDraftChange={setDraftQty}
              onEdit={() => requestPassword("Edit Item", () => { setEditingId(r.id); setDraftQty(String(r.quantity)); })}
              onDelete={() => requestPassword("Delete Item", () => deleteRecordFn("claimed", r.id))}
              onSave={() => {
                const qty = parseInt(draftQty, 10);
                if (qty > 0) updateRecord("claimed", r.id, { quantity: qty });
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
            />
          ))}
        </div>
      )}

      <h2 className="display font-bold text-sm uppercase tracking-wide mb-2" style={{ color: "var(--ink-soft)" }}>Spare — {spareQty}</h2>
      {editingSpare && spareRec ? (
        <div className="tag-card px-4 py-3 flex items-center gap-2">
          <input type="number" min="1" value={draftSpareQty} onChange={e => setDraftSpareQty(e.target.value)}
            className="w-20 px-2 py-1.5 rounded-lg text-lg mono" autoFocus />
          <button onClick={() => {
            const qty = parseInt(draftSpareQty, 10);
            if (qty > 0) updateRecord("spare", spareRec.id, { quantity: qty });
            setEditingSpare(false);
          }} className="btn-primary text-xs px-3 py-1.5 rounded-lg font-semibold">Save</button>
          <button onClick={() => setEditingSpare(false)} className="btn-outline text-xs px-3 py-1.5 rounded-lg font-semibold">Cancel</button>
        </div>
      ) : (
        <div className="tag-card px-4 py-3 flex items-center justify-between">
          <span className="mono text-2xl font-semibold">{spareQty}</span>
          {spareRec && (
            <div className="flex items-center gap-1.5">
              <button onClick={() => requestPassword("Edit Spare Quantity", () => { setEditingSpare(true); setDraftSpareQty(String(spareRec.quantity)); })}
                aria-label="Edit spare quantity" title="Edit quantity" className="icon-btn"><Pencil size={14} /></button>
              <button onClick={() => requestPassword("Delete Spare Stock", () => deleteRecordFn("spare", spareRec.id))}
                aria-label="Delete spare stock" title="Delete" className="icon-btn danger"><Trash2 size={14} /></button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BackBtn({ goto, onClick }) {
  return (
    <button onClick={onClick || (() => goto({ name: "dashboard" }))} className="flex items-center gap-1.5 text-sm font-medium mb-4" style={{ color: "var(--ink-soft)" }}>
      <ArrowLeft size={15} /> Back
    </button>
  );
}

// ================= PERSON PAGE =================
function PersonPage({ name, data, goto, markReceived, addStock, otherNames, updateRecord, deleteRecordFn, requestPassword }) {
  const [addingExpected, setAddingExpected] = useState(false);
  const [exCategory, setExCategory] = useState("Laptop");
  const [exOtherName, setExOtherName] = useState("");
  const [exQty, setExQty] = useState(1);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(null); // { list, id } | null
  const [draftQty, setDraftQty] = useState("");

  const claimed = data.claimed.filter(r => r.person.toLowerCase() === name.toLowerCase());
  const pending = data.pending.filter(r => r.person.toLowerCase() === name.toLowerCase());
  const givenOut = data.givenOut.filter(r => r.person.toLowerCase() === name.toLowerCase());
  const isNew = claimed.length === 0 && pending.length === 0 && givenOut.length === 0;

  function submitExpected(e) {
    e.preventDefault();
    const qty = parseInt(exQty, 10);
    if (!qty || qty < 1) { setErr("Enter a valid quantity."); return; }
    if (exCategory === "Other Equipment" && !exOtherName.trim()) { setErr("Enter what the item is."); return; }
    setErr("");
    addStock({ category: exCategory, otherName: exOtherName, quantity: qty, status: "pending", person: name });
    setExQty(1); setExOtherName(""); setAddingExpected(false);
  }

  function startEdit(list, r) {
    requestPassword("Edit Item", () => { setEditing({ list, id: r.id }); setDraftQty(String(r.quantity)); });
  }
  function saveEdit() {
    const qty = parseInt(draftQty, 10);
    if (qty > 0) updateRecord(editing.list, editing.id, { quantity: qty });
    setEditing(null);
  }
  function requestDelete(list, id) {
    requestPassword("Delete Item", () => deleteRecordFn(list, id));
  }

  return (
    <div className="max-w-lg">
      <BackBtn goto={goto} />
      <h1 className="display text-2xl font-bold mb-1">{name}</h1>
      {isNew && <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>No equipment on record yet for {name}.</p>}

      {claimed.length > 0 && (
        <button onClick={() => goto({ name: "giveout", person: name })} className="btn-primary px-4 py-2.5 rounded-xl font-semibold mb-6 flex items-center gap-2">
          <Send size={15} /> Give Out Items
        </button>
      )}

      <Section title="Currently Here" icon={PackageCheck}>
        {claimed.length === 0 ? <Empty text="Nothing currently here." /> : claimed.map(r => (
          <ItemRow key={r.id}
            label={itemLabel(r)}
            quantity={r.quantity}
            chipClass="chip-claimed"
            editing={editing?.list === "claimed" && editing?.id === r.id}
            draftQty={draftQty}
            onDraftChange={setDraftQty}
            onEdit={() => startEdit("claimed", r)}
            onDelete={() => requestDelete("claimed", r.id)}
            onSave={saveEdit}
            onCancel={() => setEditing(null)}
          />
        ))}
      </Section>

      <Section title="Not Received Yet" icon={Clock}>
        {pending.length === 0 ? <Empty text="Nothing expected right now." /> : pending.map(r => (
          editing?.list === "pending" && editing?.id === r.id ? (
            <div key={r.id} className="tag-card flex items-center justify-between px-4 py-2.5 gap-2">
              <span className="font-medium truncate">{itemLabel(r)}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <input type="number" min="1" value={draftQty} onChange={e => setDraftQty(e.target.value)}
                  className="w-16 px-2 py-1.5 rounded-lg text-sm text-center" autoFocus />
                <button onClick={saveEdit} className="btn-primary text-xs px-2.5 py-1.5 rounded-lg font-semibold">Save</button>
                <button onClick={() => setEditing(null)} className="btn-outline text-xs px-2.5 py-1.5 rounded-lg font-semibold">Cancel</button>
              </div>
            </div>
          ) : (
            <div key={r.id} className="tag-card flex items-center justify-between px-4 py-2.5 gap-2">
              <span className="font-medium truncate">{itemLabel(r)}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="mono chip-pending text-xs font-semibold px-2 py-1 rounded-full">×{r.quantity}</span>
                <button onClick={() => markReceived(r.id)} className="btn-outline text-xs px-2.5 py-1.5 rounded-lg font-semibold flex items-center gap-1">
                  <CheckCircle2 size={13} /> Mark as Received
                </button>
                <button onClick={() => startEdit("pending", r)} aria-label={`Edit quantity for ${itemLabel(r)}`} title="Edit quantity" className="icon-btn"><Pencil size={13} /></button>
                <button onClick={() => requestDelete("pending", r.id)} aria-label={`Delete ${itemLabel(r)}`} title="Delete" className="icon-btn danger"><Trash2 size={13} /></button>
              </div>
            </div>
          )
        ))}
        {!addingExpected ? (
          <button onClick={() => setAddingExpected(true)} className="text-sm underline mt-1" style={{ color: "var(--ink-soft)" }}>+ Add Expected Item</button>
        ) : (
          <form onSubmit={submitExpected} className="tag-card p-4 flex flex-col gap-3 mt-1">
            <select value={exCategory} onChange={e => { setExCategory(e.target.value); setExOtherName(""); }} className="px-3 py-2 rounded-lg">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {exCategory === "Other Equipment" && (
              <input type="text" list="other-names-p" value={exOtherName} onChange={e => setExOtherName(e.target.value)} placeholder="What is the item?" className="px-3 py-2 rounded-lg" />
            )}
            <datalist id="other-names-p">{otherNames.map(n => <option key={n} value={n} />)}</datalist>
            <input type="number" min="1" value={exQty} onChange={e => setExQty(e.target.value)} className="px-3 py-2 rounded-lg" />
            {err && <div className="text-sm flex items-center gap-1.5" style={{ color: "var(--danger)" }}><AlertCircle size={14} /> {err}</div>}
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex-1 py-2 rounded-lg font-semibold">Add</button>
              <button type="button" onClick={() => setAddingExpected(false)} className="btn-outline px-3 py-2 rounded-lg font-semibold">Cancel</button>
            </div>
          </form>
        )}
      </Section>

      <Section title="Previously Given Out" icon={HistoryIcon}>
        {givenOut.length === 0 ? <Empty text="Nothing given out yet." /> : givenOut.map(r => (
          <ItemRow key={r.id}
            label={itemLabel(r)}
            quantity={r.quantity}
            chipClass="chip-pending"
            editing={editing?.list === "givenOut" && editing?.id === r.id}
            draftQty={draftQty}
            onDraftChange={setDraftQty}
            onEdit={() => startEdit("givenOut", r)}
            onDelete={() => requestDelete("givenOut", r.id)}
            onSave={saveEdit}
            onCancel={() => setEditing(null)}
          />
        ))}
      </Section>
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="mb-7">
      <h2 className="display font-bold text-sm uppercase tracking-wide mb-2 flex items-center gap-1.5" style={{ color: "var(--ink-soft)" }}>
        <Icon size={14} /> {title}
      </h2>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Empty({ text }) {
  return <p className="text-sm" style={{ color: "var(--ink-soft)" }}>{text}</p>;
}
