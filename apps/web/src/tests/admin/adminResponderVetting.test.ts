import { afterEach, describe, expect, it, vi } from "vitest";
import { http } from "@/lib/axios";
import { getRespondersList } from "@/features/admin/api/getRespondersList";
import { approveResponder } from "@/features/admin/api/approveResponder";

describe("Admin Responder Vetting & Fail-Closed Approval Suite", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("queries /admin/responders directly so pending and revoked units remain visible", async () => {
    const getSpy = vi.spyOn(http, "get").mockResolvedValue({
      data: [
        {
          id: "resp-pending",
          userId: "usr-pending",
          unitCode: "RES-8F12",
          displayName: "Dr. Priya Verma",
          type: "medical_volunteer",
          status: "off_duty",
          capabilities: ["first_aid"],
          isApproved: false,
          user: {
            id: "usr-pending",
            email: "priya.med@bhopal.demo",
            full_name: "Dr. Priya Verma",
          },
        },
        {
          id: "resp-approved",
          userId: "usr-approved",
          unitCode: "F-2",
          displayName: "Fire Unit F-2",
          type: "fire_warden",
          status: "available",
          capabilities: ["firefighting"],
          isApproved: true,
        },
      ],
    } as never);

    const list = await getRespondersList();

    expect(getSpy).toHaveBeenCalledWith("/admin/responders");
    expect(getSpy).not.toHaveBeenCalledWith("/operator/responders");
    expect(list).toHaveLength(2);
    expect(list[0].approved).toBe(false);
    expect(list[0].fullName).toBe("Dr. Priya Verma");
    expect(list[0].email).toBe("priya.med@bhopal.demo");
    expect(list[1].approved).toBe(true);
  });

  it("fails closed (approved=false) when backend omits approval flags", async () => {
    vi.spyOn(http, "get").mockResolvedValue({
      data: [
        {
          id: "resp-unknown",
          unitCode: "U-99",
          displayName: "Unverified Unit",
          type: "volunteer",
        },
      ],
    } as never);

    const list = await getRespondersList();
    expect(list[0].approved).toBe(false);
  });

  it("posts approval and revocation payloads to /admin/responders/{id}/approve", async () => {
    const postSpy = vi.spyOn(http, "post").mockResolvedValue({ data: { isApproved: false } } as never);

    await approveResponder("resp-1", false);
    expect(postSpy).toHaveBeenCalledWith("/admin/responders/resp-1/approve", {
      approved: false,
      approve: false,
    });
  });
});
