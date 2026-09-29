import { handleWorkspaceRequest } from "@/lib/httpRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleWorkspaceRequest;
export const PUT = handleWorkspaceRequest;
export const POST = handleWorkspaceRequest;
