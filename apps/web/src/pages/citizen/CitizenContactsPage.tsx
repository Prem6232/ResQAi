import { MobileHeader } from "@/components/common/Header";
import { mockApi } from "@/lib/mock-api";
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

export function CitizenContactsPage() {
  const [share, setShare] = useState(true);
  const [sms, setSms] = useState(true);
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRel, setNewRel] = useState("");

  useEffect(() => {
    mockApi.contacts().then(setContacts);
  }, []);

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
                    await mockApi.deleteContact(c.id);
                    const updated = await mockApi.contacts();
                    setContacts(updated);
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
          <div className="flex gap-2">
            <Button
              className="flex-1"
              variant="command"
              disabled={!newName.trim() || !newPhone.trim()}
              onClick={async () => {
                await mockApi.addContact({ name: newName, phone: newPhone, relationshipLabel: newRel });
                setNewName("");
                setNewPhone("");
                setNewRel("");
                setShowAdd(false);
                const updated = await mockApi.contacts();
                setContacts(updated);
              }}
            >
              Save contact
            </Button>
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button className="mt-4 w-full" variant="outline" onClick={() => setShowAdd(true)}>
          Add contact
        </Button>
      )}
      <div className="mt-6 space-y-3 rounded-3xl bg-white p-4 shadow-card">
        <label className="flex items-center justify-between text-sm">
          Share live location
          <Switch checked={share} onCheckedChange={setShare} />
        </label>
        <label className="flex items-center justify-between text-sm">
          Notify by SMS
          <Switch checked={sms} onCheckedChange={setSms} />
        </label>
        <p className="text-xs text-ink-700/45">SMS notification alerts live campus contacts.</p>
      </div>
    </div>
  );
}
