// Convert 3D Sphere Vector (x, y, z) to Geographic Latitude & Longitude
export function vectorToLatLon(vector) {
  const norm = vector.clone().normalize();
  const lat = Math.asin(norm.y) * (180 / Math.PI);
  const lon = Math.atan2(norm.z, -norm.x) * (180 / Math.PI);

  const latStr = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}`;
  const lonStr = `${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? "E" : "W"}`;

  return { lat, lon, latStr, lonStr };
}

// Convert Geographic Latitude & Longitude (degrees) to 3D Sphere Vector
export function latLonToVector(latDeg, lonDeg, radius = 1.0) {
  const phi = (90 - latDeg) * (Math.PI / 180);
  const theta = (lonDeg + 180) * (Math.PI / 180);

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);

  return { x, y, z };
}

// Calculate satellite position along elliptical orbit at progress t (0 to 1)
export function getSatelliteOrbitPosition(t, radius = 1.38) {
  const theta = t * Math.PI * 2;
  const x = Math.cos(theta) * radius;
  const z = Math.sin(theta) * radius;
  const y = Math.sin(theta * 2) * 0.28; // Inclined orbit plane

  return { x, y, z };
}
