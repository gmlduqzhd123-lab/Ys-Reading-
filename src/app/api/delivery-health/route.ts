import { NextRequest, NextResponse } from "next/server";
import { deliveryHealth } from "@/lib/delivery-health";
export async function GET(request: NextRequest) {
  try {
    const pending = Number(request.nextUrl.searchParams.get("pending") ?? "0");
    return NextResponse.json(await deliveryHealth(Number.isSafeInteger(pending) && pending > 0 ? pending : undefined), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { configured: false, healthy: false, code: "DELIVERY_CHECK_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
