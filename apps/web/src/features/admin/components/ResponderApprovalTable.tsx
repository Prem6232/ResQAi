import { mockApi } from "@/lib/mock-api";
import { useState, useEffect } from "react";
import type { ResponderProfile } from "@/types/responder";
import { Button } from "@/components/ui/button";
import { Table, Td, Th } from "@/components/ui/table";
import { approveResponder } from "../api/approveResponder";

export function ResponderApprovalTable() {
  const [responders, setResponders] = useState<ResponderProfile[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    mockApi.responders().then(setResponders);
  }, []);

  const handleToggle = async (r: ResponderProfile) => {
    setLoadingId(r.id);
    try {
      await approveResponder(r.id, !r.approved);
      const list = await mockApi.responders();
      setResponders(list);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <Table>
      <thead>
        <tr>
          <Th>Unit</Th>
          <Th>Type</Th>
          <Th>Approved</Th>
          <Th>Action</Th>
        </tr>
      </thead>
      <tbody>
        {responders.map((r) => (
          <tr key={r.id} className="border-t">
            <Td>{r.unitCode}</Td>
            <Td>{r.type.replaceAll("_", " ")}</Td>
            <Td>
              <span className={r.approved ? "text-duty-600 font-medium" : "text-amber-600 font-medium"}>
                {r.approved ? "Approved" : "Pending"}
              </span>
            </Td>
            <Td>
              <Button
                size="sm"
                variant={r.approved ? "outline" : "command"}
                disabled={loadingId === r.id}
                onClick={() => handleToggle(r)}
              >
                {r.approved ? "Revoke" : "Approve"}
              </Button>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
