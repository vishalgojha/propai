/**
 * Real Data Test for PropAI GRAS
 * Testing "DLH Signature" (Bandra West / Juhu) actual data patterns.
 */

interface IGRTransaction {
  doc_number: string;
  registration_date: string;
  sro_office: string;
  district: string;
  article_type: string;
  consideration_amount: number;
  property_description: string;
  buyer_name: string;
  seller_name: string;
  village_locality: string;
  area_sqft: number;
}

const dlhSignatureRecord: IGRTransaction = {
  doc_number: "4021/2024-BDR",
  registration_date: "2024-11-12",
  sro_office: "Sub-Registrar Bandra 1",
  district: "Mumbai Suburban",
  article_type: "Sale Deed",
  consideration_amount: 85000000, // 8.5 Crore
  property_description: "DLH Signature, Flat 1403, 14th Floor, SV Road, Bandra West",
  buyer_name: "Rahul Mehra & Anr",
  seller_name: "Dev Land and Housing Ltd (DLH)",
  village_locality: "Bandra West",
  area_sqft: 1250 // Carpet Area
};

async function processDLHData(record: IGRTransaction, isPremiumUser: boolean) {
  console.log(`\n--- GRAS Data Access [Mode: ${isPremiumUser ? '💎 PREMIUM' : '🆓 FREE'}] ---`);
  console.log(`Project: DLH Signature (Bandra West)`);
  console.log(`Locality: ${record.village_locality}`);
  
  const psf = record.consideration_amount / record.area_sqft;
  console.log(`Transaction: ₹${record.consideration_amount.toLocaleString()} (₹${psf.toFixed(2)}/sqft)`);

  if (isPremiumUser) {
    console.log(`Buyer: ${record.buyer_name}`);
    console.log(`Seller: ${record.seller_name}`);
  } else {
    console.log(`Buyer: [🔒 Upgrade to Premium to view name]`);
    console.log(`Seller: [🔒 Upgrade to Premium to view name]`);
  }
  
  console.log('--------------------------------------------------');
}

// Test both modes
console.log('Testing Tiered Access Logic...');
processDLHData(dlhSignatureRecord, false); // Free mode
processDLHData(dlhSignatureRecord, true);  // Premium mode

