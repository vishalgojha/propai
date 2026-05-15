function getTimeWindow(timeframe) {
  const now = Date.now();
  switch (timeframe) {
    case 'today':
      return new Date(now - 24 * 60 * 60 * 1000);
    case 'this_week':
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
  }
}

function countEntries(record) {
  if (!Array.isArray(record.entries)) return 0;
  return record.entries.length;
}

function getBrokerFromRecord(record) {
  if (!Array.isArray(record.contacts) || record.contacts.length === 0) return null;
  const contact = record.contacts[0];
  const parts = contact.split(/\s+/);
  const phone = parts.find((p) => /^\d{10,}$/.test(p)) || null;
  const name = parts.filter((p) => !/^\d{10,}$/.test(p)).join(' ') || 'Unknown';
  return { name, phone };
}

function getPropertyType(entry) {
  const intent = (entry.intent || '').toLowerCase();
  const propertyType = (entry.property_type || '').toLowerCase();

  if (propertyType.includes('office') || propertyType.includes('commercial') || propertyType.includes('shop') || propertyType.includes('warehouse')) return 'commercial';
  if (propertyType.includes('bhk') || propertyType.includes('flat') || propertyType.includes('apartment') || propertyType.includes('studio')) return 'residential';
  if (intent.includes('sale') || propertyType.includes('sale')) return 'sale';
  if (intent.includes('requirement') || intent.includes('wanted') || intent.includes('need')) return 'requirement';
  if (intent.includes('rent') || propertyType.includes('rent')) return 'rent';

  return 'unknown';
}

function getBHK(entry) {
  const propertyType = (entry.property_type || '').toLowerCase();
  const bhkMatch = propertyType.match(/(\d)\s*bhk/);
  if (bhkMatch) return bhkMatch[1] + ' BHK';

  const intent = (entry.intent || '').toLowerCase();
  const intentBhkMatch = intent.match(/(\d)\s*bhk/);
  if (intentBhkMatch) return intentBhkMatch[1] + ' BHK';

  return null;
}

function getLocality(entry) {
  if (entry.location) {
    if (typeof entry.location === 'string') return entry.location;
    if (entry.location.sub_area) return entry.location.sub_area;
    if (entry.location.area) return entry.location.area;
  }
  return null;
}

export function computeMostActiveGroups(records, timeframe = 'this_week') {
  const since = getTimeWindow(timeframe);
  const groups = new Map();

  for (const record of records) {
    const recordTime = new Date(record.timestamp || 0);
    const isRecent = recordTime >= since;
    const is24h = recordTime >= new Date(Date.now() - 24 * 60 * 60 * 1000);

    const key = record.group_name || record.group_id || 'unknown';
    if (!groups.has(key)) {
      groups.set(key, { name: key, posts24h: 0, posts7d: 0, listings: 0 });
    }

    const group = groups.get(key);
    if (is24h) group.posts24h += 1;
    if (isRecent) group.posts7d += 1;
    if (isRecent) group.listings += countEntries(record);
  }

  return [...groups.values()]
    .sort((a, b) => b.posts7d - a.posts7d || a.name.localeCompare(b.name));
}

export function computeRecentListings(records) {
  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000);
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const stats24h = { total: 0, residential: 0, commercial: 0, configurations: new Map(), localities: new Map() };
  const stats7d = { total: 0, residential: 0, commercial: 0, configurations: new Map(), localities: new Map() };

  for (const record of records) {
    const recordTime = new Date(record.timestamp || 0);
    const entries = Array.isArray(record.entries) ? record.entries : [];

    for (const entry of entries) {
      const type = getPropertyType(entry);
      const bhk = getBHK(entry);
      const locality = getLocality(entry);

      if (recordTime >= since24h) {
        stats24h.total += 1;
        if (type === 'residential' || type === 'rent') stats24h.residential += 1;
        if (type === 'commercial') stats24h.commercial += 1;
        if (bhk) stats24h.configurations.set(bhk, (stats24h.configurations.get(bhk) || 0) + 1);
        if (locality) stats24h.localities.set(locality, (stats24h.localities.get(locality) || 0) + 1);
      }

      if (recordTime >= since7d) {
        stats7d.total += 1;
        if (type === 'residential' || type === 'rent') stats7d.residential += 1;
        if (type === 'commercial') stats7d.commercial += 1;
        if (bhk) stats7d.configurations.set(bhk, (stats7d.configurations.get(bhk) || 0) + 1);
        if (locality) stats7d.localities.set(locality, (stats7d.localities.get(locality) || 0) + 1);
      }
    }
  }

  const topConfigs24h = [...stats24h.configurations.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([config, count]) => ({ config, count }));

  const topLocalities24h = [...stats24h.localities.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([locality, count]) => ({ locality, count }));

  const topConfigs7d = [...stats7d.configurations.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([config, count]) => ({ config, count }));

  const topLocalities7d = [...stats7d.localities.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([locality, count]) => ({ locality, count }));

  return {
    last24h: {
      total: stats24h.total,
      residential: stats24h.residential,
      commercial: stats24h.commercial,
      topConfigurations: topConfigs24h,
      topLocalities: topLocalities24h,
    },
    last7d: {
      total: stats7d.total,
      residential: stats7d.residential,
      commercial: stats7d.commercial,
      topConfigurations: topConfigs7d,
      topLocalities: topLocalities7d,
    },
  };
}

export function computeTopBrokers(records, timeframe = 'this_week') {
  const since = getTimeWindow(timeframe);
  const brokers = new Map();

  for (const record of records) {
    const recordTime = new Date(record.timestamp || 0);
    if (recordTime < since) continue;

    const broker = getBrokerFromRecord(record);
    if (!broker) continue;

    const key = broker.phone || broker.name;
    if (!brokers.has(key)) {
      brokers.set(key, { name: broker.name, phone: broker.phone, posts: 0, listingsShared: 0 });
    }

    const b = brokers.get(key);
    b.posts += 1;
    b.listingsShared += countEntries(record);
  }

  return [...brokers.values()]
    .sort((a, b) => b.listingsShared - a.listingsShared || a.name.localeCompare(b.name))
    .slice(0, 10);
}

export function computeActivityTrends(records) {
  const now = Date.now();
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const since14d = new Date(now - 14 * 24 * 60 * 60 * 1000);

  const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const currentWeekPosts = new Map();
  const previousWeekPosts = new Map();

  for (const record of records) {
    const recordTime = new Date(record.timestamp || 0);
    const day = dayOfWeek[recordTime.getDay()];

    if (recordTime >= since7d) {
      currentWeekPosts.set(day, (currentWeekPosts.get(day) || 0) + 1);
    } else if (recordTime >= since14d) {
      previousWeekPosts.set(day, (previousWeekPosts.get(day) || 0) + 1);
    }
  }

  let busiestDay = 'N/A';
  let busiestDayCount = 0;
  let totalCurrentWeek = 0;

  for (const [day, count] of currentWeekPosts.entries()) {
    totalCurrentWeek += count;
    if (count > busiestDayCount) {
      busiestDay = day;
      busiestDayCount = count;
    }
  }

  let totalPreviousWeek = 0;
  for (const [, count] of previousWeekPosts.entries()) {
    totalPreviousWeek += count;
  }

  const avgPerDay = totalCurrentWeek > 0 ? Math.round(totalCurrentWeek / 7) : 0;
  const trendPct = totalPreviousWeek > 0
    ? Math.round(((totalCurrentWeek - totalPreviousWeek) / totalPreviousWeek) * 100)
    : 0;

  let trend = 'stable';
  if (trendPct > 5) trend = 'up';
  else if (trendPct < -5) trend = 'down';

  return {
    busiestDay,
    busiestDayCount,
    avgPerDay,
    trend,
    trendPct,
    totalCurrentWeek,
    totalPreviousWeek,
  };
}

export function computeInsights(records, timeframe = 'this_week') {
  return {
    mostActiveGroups: computeMostActiveGroups(records, timeframe),
    recentListings: computeRecentListings(records),
    topBrokers: computeTopBrokers(records, timeframe),
    activityTrends: computeActivityTrends(records),
  };
}
