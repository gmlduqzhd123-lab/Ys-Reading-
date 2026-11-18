import { NextResponse } from "next/server";
import { deliveryHealth } from "@/lib/delivery-health";
export async function GET() {
  try {
    return NextResponse.json(await deliveryHealth(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { configured: false, healthy: false, code: "DELIVERY_CHECK_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
