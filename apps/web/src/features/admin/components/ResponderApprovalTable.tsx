import { mockResponders } from "@/lib/mock-store";
import { Button } from "@/components/ui/button";
import { Table, Td, Th } from "@/components/ui/table";

export function ResponderApprovalTable() {
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
        {mockResponders.map((r) => (
          <tr key={r.id} className="border-t">
            <Td>{r.unitCode}</Td>
            <Td>{r.type}</Td>
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
