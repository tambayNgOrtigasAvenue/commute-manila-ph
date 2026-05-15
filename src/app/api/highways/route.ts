import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const level = searchParams.get("level") || "2";

    // We select the geom directly. Supabase returns it as a GeoJSON object for GEOMETRY columns.
    const { data, error } = await supabase
      .from("highways")
      .select(`name, admin_level, highway_type, geom`)
      .eq("admin_level", parseInt(level));

    if (error) throw error;

    const geojson = {
      type: "FeatureCollection",
      features: data.map((item: any) => ({
        type: "Feature",
        properties: {
          name: item.name,
          type: item.highway_type,
        },
        geometry: item.geom 
      }))
    };

    return NextResponse.json(geojson, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}