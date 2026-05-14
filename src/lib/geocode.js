// Geocode addresses → lat/lng using OpenStreetMap Nominatim. Free, no API key.
// Usage policy: max 1 request/sec; include a User-Agent identifying the app.
// https://operations.osmfoundation.org/policies/nominatim/

export async function geocodeAddress(address) {
  if (!address || !address.trim()) throw new Error("Address is empty");
  const q = encodeURIComponent(address.trim());
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=1&addressdetails=1`;
  const res = await fetch(url, {
    headers: { "Accept-Language": "en", "Accept": "application/json" },
  });
  if (!res.ok) throw new Error(`Geocoder responded ${res.status}`);
  const data = await res.json();
  if (!data || data.length === 0) throw new Error(`No results for "${address}"`);
  const r = data[0];
  return {
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    displayName: r.display_name,
    country: r.address?.country || "",
    city: r.address?.city || r.address?.town || r.address?.village || r.address?.county || "",
  };
}
