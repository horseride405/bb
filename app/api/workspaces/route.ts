import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("workspaces")
    .select("id, name, slug, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Unable to load workspaces" }, { status: 500 });
  }

  return NextResponse.json({ workspaces: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: { name?: unknown; slug?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  if (typeof body.name !== "string" || typeof body.slug !== "string") {
    return NextResponse.json({ error: "Workspace name and slug are required" }, { status: 400 });
  }

  const name = body.name.trim();
  const slug = body.slug.trim().toLowerCase();
  if (name.length < 2 || slug.length < 2 || !/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: "Use a name and a slug containing letters, numbers, or hyphens" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("create_workspace", {
    workspace_name: name,
    workspace_slug: slug,
  });

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    return NextResponse.json({ error: status === 409 ? "That workspace slug is already in use" : "Unable to create workspace" }, { status });
  }

  return NextResponse.json({ workspace: data[0] }, { status: 201 });
}
