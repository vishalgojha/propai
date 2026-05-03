/**
 * Mock Data Processor for PropAI GRAS
 * This allows us to test the data structure and processing logic 
 * without needing a live Supabase connection.
 */

interface IGRTransaction {
  doc_number: string;
  registration_date: string;
  sro_office: string;
  district: string;
  consideration_amount: number;
  village_locality: string;
  area_sqft: number;
}

const mockRawData = [
  {
    doc_number: "PNP-4521-2026",
    registration_date: "2026-05-01",
    sro_office: "SRO Panvel 1",
    district: "Raigad",
    consideration_amount: 8500000,
    village_locality: "Kharghar",
    area_sqft: 1050
  },
  {
    doc_number: "MUM-9982-2026",
    registration_date: "2026-05-02",
    sro_office: "SRO Andheri 2",
    district: "Mumbai Suburban",
    consideration_amount: 24000000,
    village_locality: "Andheri West",
    area_sqft: 850
  }
];

function processTransactions(data: IGRTransaction[]) {
  console.log('--- Processing Mock IGR Data ---');
  
  data.forEach(tx => {
    const psf = tx.consideration_amount / tx.area_sqft;
    console.log(`[${tx.doc_number}] ${tx.village_locality}: ₹${tx.consideration_amount.toLocaleString()} (₹${psf.toFixed(2)}/sqft)`);
  });

  console.log('-------------------------------');
  console.log(`Successfully processed ${data.length} mock records.`);
}

// Run the mock test
processTransactions(mockRawData);
