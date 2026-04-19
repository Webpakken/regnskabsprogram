// src/lib/cvrLookup.ts

export async function lookupCVR(cvr: string) {
  // Brug CVR API: https://cvrapi.dk/
  const url = `https://cvrapi.dk/api?search=${encodeURIComponent(cvr)}&country=dk`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'bilago-app/1.0',
    },
  });
  if (!res.ok) throw new Error('CVR slå-op fejlede');
  return res.json();
}
