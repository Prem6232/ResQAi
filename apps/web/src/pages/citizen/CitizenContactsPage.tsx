import { MobileHeader } from "@/components/common/Header";
import { api } from "@/lib/api";
import { StatusIndicator } from "@/components/common/StatusIndicator";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";

interface ContactItem {
  id: string;
  name: string;
  relationshipLabel?: string;
  relationship_label?: string;
  phone?: string;
  isActive?: boolean;
}

function readBoolPref(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === "true";
  } catch {
    return fallback;
  }
}

export function CitizenContactsPage() {
  const [share, setShare] = useState(() => readBoolPref("sg.citizen.share", true));
  const [sms, setSms] = useState(() => readBoolPref("sg.citizen.sms", true));
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRel, setNewRel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.contacts().then(setContacts);
  }, []);

  const maxReached = contacts.length >= 3;

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await api.addContact({ name: newName.trim(), phone: newPhone.trim(), relationshipLabel: newRel.trim() });
      setNewName("");
      setNewPhone("");
      setNewRel("");
      setShowAdd(false);
      const updated = await api.contacts();
      setContacts(updated);
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { message?: string; detail?: string } } })?.response?.data;
      setError(data?.message || data?.detail || "Could not save contact (check phone format & 3-contact limit).");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <MobileHeader role="Citizen" />
      <h1 className="font-display text-2xl font-extrabold">Trusted contacts</h1>
      <p className="mt-1 text-xs text-ink-700/50">They get your live location when you press SOS, if you enable sharing.</p>
      <div className="mt-4 space-y-3">
        {contacts.length > 0 ? (
          contacts.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-3xl bg-white p-4 shadow-card">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-paper-100 text-xs font-bold">
                  {c.name
                    .split(" ")
                    .map((p) => p[0])
                    .join("")}
                </span>
                <div>
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-xs text-ink-700/50">
                    {c.relationshipLabel || c.relationship_label || "Family / Contact"} {c.phone ? `· ${c.phone}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusIndicator label="Active" tone="ok" />
                <button
                  type="button"
                  aria-label="Remove contact"
                  onClick={async () => {
                    setError(null);
                    try {
                      await api.deleteContact(c.id);
                      const updated = await api.contacts();
                      setContacts(updated);
                    } catch {
                      setError("Could not remove trusted contact.");
                    }
                  }}
                  className="ml-2 text-xs text-red-500 hover:text-red-700 font-medium"
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-ink-700/50">No trusted contacts added yet.</p>
        )}
      </div>

      {showAdd ? (
        <div className="mt-4 rounded-3xl bg-white p-4 shadow-card space-y-3">
          <h2 className="text-sm font-semibold">New Emergency Contact</h2>
          <input
            type="text"
            placeholder="Full Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
          <input
            type="tel"
            placeholder="Phone Number (+91...)"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Relationship (Parent, Roommate, etc.)"
            value={newRel}
            onChange={(e) => setNewRel(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
          {error ? <p className="text-xs text-sos-600">{error}</p> : null}
          <div className="flex gap-2">
            <Button
              className="flex-1"
              variant="command"
              disabled={!newName.trim() || !newPhone.trim() || saving}
              onClick={() => void handleSave()}
            >
              {saving ? "Saving…" : "Save contact"}
            </Button>
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {error ? <p className="text-xs text-sos-600">{error}</p> : null}
          <Button
            className="w-full"
            variant="outline"
            disabled={maxReached}
            onClick={() => {
              setError(null);
              setShowAdd(true);
            }}
          >
            {maxReached ? "Maximum 3 trusted contacts reached" : "Add contact"}
          </Button>
        </div>
      )}
      <div className="mt-6 space-y-3 rounded-3xl bg-white p-4 shadow-card">
        <label className="flex items-center justify-between text-sm">
          Share live location
          <Switch
            checked={share}
            onCheckedChange={(v) => {
              setShare(v);
              try {
                localStorage.setItem("sg.citizen.share", String(v));
              } catch {
                // ignore storage errors
              }
            }}
          />
        </label>
        <label className="flex items-center justify-between text-sm">
          Notify by SMS
          <Switch
            checked={sms}
            onCheckedChange={(v) => {
              setSms(v);
              try {
                localStorage.setItem("sg.citizen.sms", String(v));
              } catch {
                // ignore storage errors
              }
            }}
          />
        </label>
        <p className="text-xs text-ink-700/45">SMS notification alerts live Bhopal emergency contacts.</p>
      </div>
    </div>
  );
}
