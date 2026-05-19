import { supabaseAdmin } from '../config/supabase';

const db = supabaseAdmin;

export async function generateBroadcastLists(tenantId: string): Promise<number> {
  const { data: contacts, error } = await db!
    .from('broker_contacts')
    .select('id, inferred_areas')
    .eq('tenant_id', tenantId)
    .eq('unsubscribed', false);

  if (error || !contacts?.length) return 0;

  const areaMap = new Map<string, string[]>();

  for (const contact of contacts) {
    for (const area of contact.inferred_areas) {
      const existing = areaMap.get(area) || [];
      existing.push(contact.id);
      areaMap.set(area, existing);
    }
  }

  let listsGenerated = 0;

  for (const [area, contactIds] of areaMap) {
    const name = `${area} Brokers`;

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
      const { data: inserted } = await db!
        .from('broadcast_lists')
        .insert({
          tenant_id: tenantId,
          name,
          areas: [area],
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

    const existingIds = new Set((existingRows.data || []).map(r => r.contact_id));
    const toRemove = [...existingIds].filter(id => !contactIds.includes(id));
    const toAdd = contactIds.filter(id => !existingIds.has(id));

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
        .insert(toAdd.map(cid => ({ list_id: listId, contact_id: cid })));
    }
  }

  const activeIds = contacts.map(c => c.id);

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

    const existingAllIds = new Set((existingAll.data || []).map(r => r.contact_id));
    const toRemoveAll = [...existingAllIds].filter(id => !activeIds.includes(id));
    const toAddAll = activeIds.filter(id => !existingAllIds.has(id));

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
        .insert(toAddAll.map(cid => ({ list_id: allList.id, contact_id: cid })));
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
        activeIds.map(cid => ({ list_id: inserted.id, contact_id: cid }))
      );
    }
  }

  return listsGenerated;
}
