import type { Role } from "@/types/common";

export const permissionMatrix = {
  submitReport: ["citizen"],
  viewOwnReports: ["citizen"],
  viewNearbyAlerts: ["citizen"],
  manageTrustedContacts: ["citizen"],
  receiveOffers: ["responder"],
  updateAssignmentStatus: ["responder", "operator"],
  reviewIncidents: ["operator", "admin"],
  dispatchOffers: ["operator"],
  mergeReports: ["operator"],
  approveResponders: ["admin"],
  viewAudit: ["admin", "operator"],
  configureCampus: ["admin"],
} as const satisfies Record<string, Role[]>;

export type Permission = keyof typeof permissionMatrix;
