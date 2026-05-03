import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const { data, error } = await supabase
      .from("highways")
      .select("*");

    if (error) throw error;

    const geojson = {
      type: "FeatureCollection",
      features: data.map((item: any) => ({
        type: "Feature",
        properties: {
          name: item.name,
          highway: item.highway,
          ...item,
        },
        geometry: item.geom,
      })),
    };

    return NextResponse.json(geojson, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
