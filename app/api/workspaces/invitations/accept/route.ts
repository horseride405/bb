import { NextResponse } from "next/server";

import { hashInvitationToken } from "@/lib/team/invitations";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  let body: { invitation_id?: unknown; token?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  if (typeof body.invitation_id !== "string" || typeof body.token !== "string") {
    return NextResponse.json({ error: "Invitation ID and token are required" }, { status: 400 });
  }
  let digest: string;
  try {
    digest = hashInvitationToken(body.token);
  } catch {
    return NextResponse.json({ error: "Invitation token is invalid" }, { status: 400 });
  }
  const { data, error } = await supabase.rpc("accept_workspace_invitation", {
    invitation_id: body.invitation_id,
    invitation_token_digest: digest,
  });
  if (error || !data?.[0]) return NextResponse.json({ error: "Invitation is invalid, expired, or already accepted" }, { status: 400 });
  return NextResponse.json({ membership: data[0] });
}
