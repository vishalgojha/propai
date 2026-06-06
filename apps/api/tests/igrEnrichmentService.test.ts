import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMocks = vi.hoisted(() => {
  const upsert = vi.fn();
  const from = vi.fn(() => ({ upsert }));
  return { upsert, from };
});

vi.mock('../src/config/supabase', () => ({
  supabaseAdmin: { from: supabaseMocks.from },
  supabase: null,
}));

import { igrEnrichmentService } from '../src/services/igrEnrichmentService';

describe('IgrEnrichmentService seedBuildingName', () => {
  beforeEach(() => {
    supabaseMocks.upsert.mockReset();
    supabaseMocks.from.mockClear();
    supabaseMocks.upsert.mockResolvedValue({ error: null });
  });

  it('writes a deterministic stream index seed row', async () => {
    await igrEnrichmentService.seedBuildingName('Kalpataru Magnus', 'Bandra East');

    expect(supabaseMocks.from).toHaveBeenCalledWith('igr_transactions');
    expect(supabaseMocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        doc_number: expect.stringMatching(/^seed:[a-f0-9]{20}$/),
        registration_date: '1900-01-01',
        building_name: 'Kalpataru Magnus',
        locality: 'Bandra East',
        village_locality: 'Bandra East',
        source: 'stream_index_seed',
      }),
      expect.objectContaining({
        onConflict: 'doc_number',
        ignoreDuplicates: false,
      }),
    );
  });

  it('skips short building names', async () => {
    await igrEnrichmentService.seedBuildingName('  x ', 'Bandra East');

    expect(supabaseMocks.from).not.toHaveBeenCalled();
    expect(supabaseMocks.upsert).not.toHaveBeenCalled();
  });
});
