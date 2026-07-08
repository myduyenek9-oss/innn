import generatedLocations from './locations.generated.json' with { type: 'json' };

export const LOCATION_TREE = generatedLocations;

export function findLocationByCode(code) {
  for (const province of LOCATION_TREE) {
    for (const city of province.cities) {
      for (const county of city.counties) {
        if (county.code === code) {
          return { province, city, county };
        }
      }
    }
  }
  return null;
}

export function findDefaultLocation(locationText = '') {
  const text = String(locationText || '');
  const candidates = [];
  for (const province of LOCATION_TREE) {
    for (const city of province.cities) {
      for (const county of city.counties) {
        candidates.push({ province, city, county });
      }
    }
  }

  if (text.includes('泉州')) {
    return candidates.find(item => item.county.code === '350503')
      || candidates.find(item => item.city.name.includes('泉州'))
      || null;
  }

  return candidates.find(item => item.county.code === '350503') || candidates[0] || null;
}
