import { mockApi } from "@/lib/mock-api";
import { useState, useEffect } from "react";
import type { ResponderProfile } from "@/types/responder";
import { Button } from "@/components/ui/button";
import { Table, Td, Th } from "@/components/ui/table";

export function ResponderApprovalTable() {
  const [responders, setResponders] = useState<ResponderProfile[]>([]);

  useEffect(() => {
    mockApi.responders().then(setResponders);
  }, []);

  return (
    <Table>
      <thead>
        <tr>
          <Th>Unit</Th>
          <Th>Type</Th>
          <Th>Approved</Th>
          <Th></Th>
        </tr>
      </thead>
      <tbody>
        {responders.map((r) => (
          <tr key={r.id} className="border-t">
            <Td>{r.unitCode}</Td>
            <Td>{r.type.replaceAll("_", " ")}</Td>
            <Td>{r.approved ? "Yes" : "No"}</Td>
            <Td>
              <Button size="sm" variant="command">
                Review
              </Button>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
