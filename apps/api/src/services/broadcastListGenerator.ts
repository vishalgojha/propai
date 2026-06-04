import { supabaseAdmin } from '../config/supabase';

const db = supabaseAdmin;

const LOCALITY_POCKETS: Record<string, string[]> = {
  'Bandra-Khar-Santacruz': [
    'bandra west', 'bandra east', 'bandra',
    'khar west', 'khar east', 'khar',
    'santacruz west', 'santacruz east', 'santacruz',
  ],
  'Andheri-Jogeshwari': [
    'andheri west', 'andheri east', 'andheri',
    'jogeshwari west', 'jogeshwari east', 'jogeshwari',
    'versova', 'lokhandwala',
  ],
  'Powai-Hiranandani': [
    'powai', 'hiranandani', 'chandivali',
    'saki naka', 'marol',
  ],
  'Lower Parel-Worli': [
    'lower parel', 'parel', 'worli',
    'prabhadevi', 'elphinstone road',
    'mahalaxmi', 'byculla',
  ],
  'Goregaon-Malad-Kandivali': [
    'goregaon west', 'goregaon east', 'goregaon',
    'malad west', 'malad east', 'malad',
    'kandivali west', 'kandivali east', 'kandivali',
    'borivali west', 'borivali east', 'borivali',
  ],
  'Chembur-Ghatkopar': [
    'chembur', 'ghatkopar west', 'ghatkopar east', 'ghatkopar',
    'kurla', 'tilak nagar',
  ],
  'Dadar-Matunga-Sion': [
    'dad ar west', 'dad ar east', 'dad ar',
    'matunga', 'sion', 'wadala',
    'mahim', 'dharavi',
  ],
  'South Mumbai': [
    'colaba', 'cuffe parade', 'nariman point',
    'churchgate', 'marine lines', 'fort',
    'ballard estate', 'cst', 'kalbadevi',
    'girgaon', 'grant road', 'tardeo',
    'breach candy', 'pedder road',
  ],
  'Thane': [
    'thane west', 'thane east', 'thane',
    'kalwa', 'mumbra', 'diva',
    'kopar khairane', 'vashi', 'nerul',
    'belapur', 'kharghar', 'panvel',
  ],
  'Mulund-Bhandup': [
    'mulund west', 'mulund east', 'mulund',
    'bhandup west', 'bhandup east', 'bhandup',
    'vikhroli', 'kanjurmarg',
  ],
};

function resolvePocket(area: string): string {
  const normalized = area.trim().toLowerCase();
  for (const [pocket, areas] of Object.entries(LOCALITY_POCKETS)) {
    if (areas.some((a) => normalized.includes(a) || a.includes(normalized))) {
      return pocket;
    }
  }
  return area.trim();
}

export async function generateBroadcastLists(tenantId: string): Promise<number> {
  const { data: contacts, error } = await db!
    .from('broker_contacts')
    .select('id, inferred_areas')
    .eq('tenant_id', tenantId)
    .eq('unsubscribed', false);

  if (error || !contacts?.length) return 0;

  const pocketMap = new Map<string, Set<string>>();

  for (const contact of contacts) {
    for (const area of contact.inferred_areas) {
      const pocket = resolvePocket(area);
      const existing = pocketMap.get(pocket) || new Set<string>();
      existing.add(contact.id);
      pocketMap.set(pocket, existing);
    }
  }

  let listsGenerated = 0;

  for (const [pocket, contactIdSet] of pocketMap) {
    const contactIds = Array.from(contactIdSet);
    const name = `${pocket} Brokers`;

    const { data: existing } = await db!
      .from('broadcast_lists')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('name', name)
      .eq('auto_generated', true)
      .maybeSingle();

    let listId: string;

    if (existing) {
      listId = existing.id;
      await db!
        .from('broadcast_lists')
        .update({
          contact_count: contactIds.length,
          updated_at: new Date().toISOString(),
        })
        .eq('id', listId);
    } else {
      const sourceAreas = contacts
        .filter((c) => contactIds.includes(c.id))
        .flatMap((c) => c.inferred_areas)
        .filter((a) => resolvePocket(a) === pocket);

      const { data: inserted } = await db!
        .from('broadcast_lists')
        .insert({
          tenant_id: tenantId,
          name,
          areas: Array.from(new Set(sourceAreas)),
          contact_count: contactIds.length,
          auto_generated: true,
        })
        .select('id')
        .single();

      if (inserted) {
        listId = inserted.id;
        listsGenerated++;
      } else {
        continue;
      }
    }

    const existingRows = await db!
      .from('broadcast_list_contacts')
      .select('contact_id')
      .eq('list_id', listId);

    const existingIds = new Set((existingRows.data || []).map((r: any) => r.contact_id));
    const toRemove = [...existingIds].filter((id) => !contactIds.includes(id));
    const toAdd = contactIds.filter((id) => !existingIds.has(id));

    if (toRemove.length) {
      await db!
        .from('broadcast_list_contacts')
        .delete()
        .eq('list_id', listId)
        .in('contact_id', toRemove);
    }

    if (toAdd.length) {
      await db!
        .from('broadcast_list_contacts')
        .insert(toAdd.map((cid) => ({ list_id: listId, contact_id: cid })));
    }
  }

  const activeIds = contacts.map((c) => c.id);

  const { data: allList } = await db!
    .from('broadcast_lists')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('name', 'All Brokers')
    .eq('auto_generated', true)
    .maybeSingle();

  if (allList) {
    await db!
      .from('broadcast_lists')
      .update({ contact_count: activeIds.length })
      .eq('id', allList.id);

    const existingAll = await db!
      .from('broadcast_list_contacts')
      .select('contact_id')
      .eq('list_id', allList.id);

    const existingAllIds = new Set((existingAll.data || []).map((r: any) => r.contact_id));
    const toRemoveAll = [...existingAllIds].filter((id) => !activeIds.includes(id));
    const toAddAll = activeIds.filter((id) => !existingAllIds.has(id));

    if (toRemoveAll.length) {
      await db!
        .from('broadcast_list_contacts')
        .delete()
        .eq('list_id', allList.id)
        .in('contact_id', toRemoveAll);
    }
    if (toAddAll.length) {
      await db!
        .from('broadcast_list_contacts')
        .insert(toAddAll.map((cid) => ({ list_id: allList.id, contact_id: cid })));
    }
  } else {
    const { data: inserted } = await db!
      .from('broadcast_lists')
      .insert({
        tenant_id: tenantId,
        name: 'All Brokers',
        areas: [],
        contact_count: activeIds.length,
        auto_generated: true,
      })
      .select('id')
      .single();

    if (inserted) {
      listsGenerated++;
      await db!.from('broadcast_list_contacts').insert(
        activeIds.map((cid) => ({ list_id: inserted.id, contact_id: cid })),
      );
    }
  }

  return listsGenerated;
}
