import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env from root or local
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY) in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  console.log('--- PropAI GRAS Connection Test ---');
  
  // 1. Try to fetch from igr_transactions
  const { data, error } = await supabase
    .from('igr_transactions')
    .select('id')
    .limit(1);

  if (error) {
    if (error.code === '42P01') {
      console.error('Table "igr_transactions" does not exist. Did you run the migration?');
    } else {
      console.error('Error connecting to Supabase:', error.message);
    }
    return;
  }

  console.log('Successfully connected to Supabase and verified "igr_transactions" table.');
  console.log('Current row count (sample):', data.length);

  // 2. Try a test insert (optional, let's just do a dry run first)
  console.log('Ready for scraping operations.');
}

testConnection().catch(console.error);
