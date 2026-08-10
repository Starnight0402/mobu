const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

// Best-effort: callers already have lat/lng before this resolves, so a
// missing key or failed lookup should never block using the coordinates.
export async function reverseGeocode(lat: number, lng: number): Promise<string | undefined> {
  if (!GOOGLE_MAPS_API_KEY) return undefined;
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`,
    );
    const data = await res.json();
    return data.results?.[0]?.formatted_address as string | undefined;
  } catch (err) {
    console.error('Reverse geocoding failed', err);
    return undefined;
  }
}
