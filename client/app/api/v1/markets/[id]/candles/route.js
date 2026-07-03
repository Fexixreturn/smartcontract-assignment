import { NextResponse } from "next/server";
import { getMarketEngine } from "../../../../../../lib/engines.js";

const TIMEFRAME_SECS = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600 };

export async function GET(req, { params }) {
  const { searchParams } = new URL(req.url);

  const timeframe = searchParams.get("timeframe") ?? "5m";
  const secs = TIMEFRAME_SECS[timeframe];
  if (!secs) {
    return NextResponse.json(
      { error: "invalid timeframe: must be one of 1m, 5m, 15m, 1h" },
      { status: 400 }
    );
  }

  const limitRaw = searchParams.get("limit") ?? "100";
  const limit = Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    return NextResponse.json(
      { error: "invalid limit: must be an integer between 1 and 500" },
      { status: 400 }
    );
  }

  const d = getMarketEngine().detail(params.id);
  if (!d) {
    return NextResponse.json({ error: "unknown market id" }, { status: 404 });
  }

  // Engine stores 5m buckets; re-bucket into the requested timeframe.
  // Note: 1m re-buckets 5m 1:1 — 5m is the finest granularity the engine keeps.
  const byBucket = new Map();
  for (const c of d.candles) {
    const t = Math.floor(c.t / secs) * secs;
    const agg = byBucket.get(t);
    if (!agg) {
      byBucket.set(t, { t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v });
    } else {
      agg.h = Math.max(agg.h, c.h);
      agg.l = Math.min(agg.l, c.l);
      agg.c = c.c;
      agg.v += c.v;
    }
  }
  // Return the engine's real candles for this timeframe, capped at `limit` (newest last).
  // `limit` is an upper bound — if the engine holds fewer buckets we return what exists
  // rather than fabricating data.
  const candles = [...byBucket.values()].sort((a, b) => a.t - b.t).slice(-limit);

  return NextResponse.json({ market_id: d.id, timeframe, candles });
}
