export type StaffClass = {
  id: string;
  name: string;
  teacher_id: string;
  created_at: string;
  owner: boolean;
  read: boolean;
  review: boolean;
  students: boolean;
  school: string | null;
};
export type CollaborationState = {
  actor: string;
  operator: boolean;
  classes: StaffClass[];
  staff: {
    id: string;
    name: string;
    permissions: string[];
    active: boolean;
    expiresAt: string;
    revision: number;
  }[];
  students: {
    id: string;
    display_name: string;
    consent_status: string;
    account_active: boolean;
    active: boolean;
    login_id: string | null;
    can_reset: boolean;
  }[];
  total: number;
  invitations: {
    id: string;
    kind: string;
    target: string;
    expiresAt: string;
  }[];
  schools: { id: string; name: string; admin: boolean }[];
  schoolRequests: { classroom: string; name: string; school: string }[];
  handovers: {
    classroom: string;
    name: string;
    recipient: string;
    expiresAt: string;
  }[];
  schoolAdmins: {
    school: string;
    id: string;
    name: string;
    active: boolean;
    revision: number;
  }[];
  operators: { id: string; name: string }[];
};
