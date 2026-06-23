export type LocalityInfo = {
  name: string;
  colloquials: string[];
  priceBands: {
    rent: { min: number; max: number };
    sale: { min: number; max: number };
    lease: { min: number; max: number };
  };
};

export const LOCALITY_DATA: LocalityInfo[] = [
  { name: 'Bandra West', colloquials: ['bandra west', 'bandra(w)', 'bandra w'], priceBands: { rent: { min: 40000, max: 300000 }, sale: { min: 20000000, max: 150000000 }, lease: { min: 400000, max: 3500000 } } },
  { name: 'Bandra East', colloquials: ['bandra east', 'bandra(e)', 'bandra e', 'bandra'], priceBands: { rent: { min: 30000, max: 200000 }, sale: { min: 15000000, max: 100000000 }, lease: { min: 350000, max: 2400000 } } },
  { name: 'Juhu', colloquials: ['juhu'], priceBands: { rent: { min: 50000, max: 400000 }, sale: { min: 30000000, max: 200000000 }, lease: { min: 600000, max: 4800000 } } },
  { name: 'Worli', colloquials: ['worli'], priceBands: { rent: { min: 50000, max: 350000 }, sale: { min: 25000000, max: 180000000 }, lease: { min: 600000, max: 4200000 } } },
  { name: 'Lower Parel', colloquials: ['lower parel', 'lowerparel'], priceBands: { rent: { min: 45000, max: 300000 }, sale: { min: 20000000, max: 150000000 }, lease: { min: 540000, max: 3600000 } } },
  { name: 'Prabhadevi', colloquials: ['prabhadevi'], priceBands: { rent: { min: 35000, max: 250000 }, sale: { min: 18000000, max: 120000000 }, lease: { min: 420000, max: 3000000 } } },
  { name: 'Dadar', colloquials: ['dadar', 'dadar west', 'dadar east'], priceBands: { rent: { min: 25000, max: 150000 }, sale: { min: 12000000, max: 80000000 }, lease: { min: 300000, max: 1800000 } } },
  { name: 'Mahalaxmi', colloquials: ['mahalaxmi'], priceBands: { rent: { min: 40000, max: 300000 }, sale: { min: 20000000, max: 150000000 }, lease: { min: 480000, max: 3600000 } } },
  { name: 'Marine Drive', colloquials: ['marine drive', 'marinedrive'], priceBands: { rent: { min: 60000, max: 500000 }, sale: { min: 30000000, max: 250000000 }, lease: { min: 720000, max: 6000000 } } },
  { name: 'Malabar Hill', colloquials: ['malabar hill', 'malabarhill'], priceBands: { rent: { min: 80000, max: 600000 }, sale: { min: 40000000, max: 300000000 }, lease: { min: 960000, max: 7200000 } } },
  { name: 'Colaba', colloquials: ['colaba'], priceBands: { rent: { min: 35000, max: 250000 }, sale: { min: 15000000, max: 120000000 }, lease: { min: 420000, max: 3000000 } } },
  { name: 'Nariman Point', colloquials: ['nariman point', 'narimanpoint'], priceBands: { rent: { min: 50000, max: 400000 }, sale: { min: 25000000, max: 200000000 }, lease: { min: 600000, max: 4800000 } } },
  { name: 'Andheri West', colloquials: ['andheri west', 'andheri(w)', 'andheri w', 'andheri'], priceBands: { rent: { min: 15000, max: 100000 }, sale: { min: 8000000, max: 40000000 }, lease: { min: 180000, max: 1200000 } } },
  { name: 'Andheri East', colloquials: ['andheri east', 'andheri(e)', 'andheri e'], priceBands: { rent: { min: 12000, max: 80000 }, sale: { min: 6000000, max: 30000000 }, lease: { min: 144000, max: 960000 } } },
  { name: 'Versova', colloquials: ['versova'], priceBands: { rent: { min: 20000, max: 120000 }, sale: { min: 10000000, max: 50000000 }, lease: { min: 240000, max: 1440000 } } },
  { name: 'Powai', colloquials: ['powai'], priceBands: { rent: { min: 20000, max: 120000 }, sale: { min: 10000000, max: 50000000 }, lease: { min: 240000, max: 1440000 } } },
  { name: 'Vikhroli', colloquials: ['vikhroli'], priceBands: { rent: { min: 12000, max: 70000 }, sale: { min: 6000000, max: 25000000 }, lease: { min: 144000, max: 840000 } } },
  { name: 'Ghatkopar West', colloquials: ['ghatkopar west', 'ghatkopar(w)', 'ghatkopar w', 'ghatkopar'], priceBands: { rent: { min: 12000, max: 65000 }, sale: { min: 5000000, max: 25000000 }, lease: { min: 144000, max: 780000 } } },
  { name: 'Ghatkopar East', colloquials: ['ghatkopar east', 'ghatkopar(e)', 'ghatkopar e'], priceBands: { rent: { min: 10000, max: 55000 }, sale: { min: 4000000, max: 20000000 }, lease: { min: 120000, max: 660000 } } },
  { name: 'Mulund West', colloquials: ['mulund west', 'mulund(w)', 'mulund w', 'mulund'], priceBands: { rent: { min: 12000, max: 60000 }, sale: { min: 5000000, max: 25000000 }, lease: { min: 144000, max: 720000 } } },
  { name: 'Mulund East', colloquials: ['mulund east', 'mulund(e)', 'mulund e'], priceBands: { rent: { min: 10000, max: 50000 }, sale: { min: 4000000, max: 20000000 }, lease: { min: 120000, max: 600000 } } },
  { name: 'Thane West', colloquials: ['thane west', 'thane(w)', 'thane w', 'thane'], priceBands: { rent: { min: 12000, max: 50000 }, sale: { min: 6000000, max: 20000000 }, lease: { min: 144000, max: 600000 } } },
  { name: 'Thane East', colloquials: ['thane east', 'thane(e)', 'thane e'], priceBands: { rent: { min: 10000, max: 40000 }, sale: { min: 5000000, max: 15000000 }, lease: { min: 120000, max: 480000 } } },
  { name: 'Borivali West', colloquials: ['borivali west', 'borivali(w)', 'borivali w', 'borivali'], priceBands: { rent: { min: 12000, max: 60000 }, sale: { min: 6000000, max: 25000000 }, lease: { min: 144000, max: 720000 } } },
  { name: 'Borivali East', colloquials: ['borivali east', 'borivali(e)', 'borivali e'], priceBands: { rent: { min: 10000, max: 45000 }, sale: { min: 4000000, max: 20000000 }, lease: { min: 120000, max: 540000 } } },
  { name: 'Malad West', colloquials: ['malad west', 'malad(w)', 'malad w', 'malad'], priceBands: { rent: { min: 12000, max: 55000 }, sale: { min: 5000000, max: 22000000 }, lease: { min: 144000, max: 660000 } } },
  { name: 'Malad East', colloquials: ['malad east', 'malad(e)', 'malad e'], priceBands: { rent: { min: 10000, max: 40000 }, sale: { min: 4000000, max: 18000000 }, lease: { min: 120000, max: 480000 } } },
  { name: 'Goregaon West', colloquials: ['goregaon west', 'goregaon(w)', 'goregaon w', 'goregaon'], priceBands: { rent: { min: 12000, max: 60000 }, sale: { min: 6000000, max: 25000000 }, lease: { min: 144000, max: 720000 } } },
  { name: 'Goregaon East', colloquials: ['goregaon east', 'goregaon(e)', 'goregaon e'], priceBands: { rent: { min: 10000, max: 45000 }, sale: { min: 4000000, max: 20000000 }, lease: { min: 120000, max: 540000 } } },
  { name: 'Kandivali West', colloquials: ['kandivali west', 'kandivali(w)', 'kandivali w', 'kandivali'], priceBands: { rent: { min: 10000, max: 45000 }, sale: { min: 4000000, max: 18000000 }, lease: { min: 120000, max: 540000 } } },
  { name: 'Kandivali East', colloquials: ['kandivali east', 'kandivali(e)', 'kandivali e'], priceBands: { rent: { min: 8000, max: 35000 }, sale: { min: 3500000, max: 15000000 }, lease: { min: 96000, max: 420000 } } },
  { name: 'Dahisar West', colloquials: ['dahisar west', 'dahisar(w)', 'dahisar w', 'dahisar'], priceBands: { rent: { min: 10000, max: 50000 }, sale: { min: 5000000, max: 20000000 }, lease: { min: 120000, max: 600000 } } },
  { name: 'Dahisar East', colloquials: ['dahisar east', 'dahisar(e)', 'dahisar e'], priceBands: { rent: { min: 8000, max: 40000 }, sale: { min: 3500000, max: 15000000 }, lease: { min: 96000, max: 480000 } } },
  { name: 'Mira Road', colloquials: ['mira road', 'miraroad'], priceBands: { rent: { min: 8000, max: 30000 }, sale: { min: 3000000, max: 12000000 }, lease: { min: 96000, max: 360000 } } },
  { name: 'Bhayander', colloquials: ['bhayander', 'bhayandar'], priceBands: { rent: { min: 7000, max: 25000 }, sale: { min: 2500000, max: 10000000 }, lease: { min: 84000, max: 300000 } } },
  { name: 'Khar West', colloquials: ['khar west', 'khar(w)', 'khar w', 'khar'], priceBands: { rent: { min: 30000, max: 200000 }, sale: { min: 15000000, max: 90000000 }, lease: { min: 360000, max: 2400000 } } },
  { name: 'Khar East', colloquials: ['khar east', 'khar(e)', 'khar e'], priceBands: { rent: { min: 20000, max: 120000 }, sale: { min: 10000000, max: 50000000 }, lease: { min: 240000, max: 1440000 } } },
  { name: 'Santacruz West', colloquials: ['santacruz west', 'santacruz(w)', 'santacruz w', 'santacruz'], priceBands: { rent: { min: 20000, max: 100000 }, sale: { min: 10000000, max: 50000000 }, lease: { min: 240000, max: 1200000 } } },
  { name: 'Santacruz East', colloquials: ['santacruz east', 'santacruz(e)', 'santacruz e'], priceBands: { rent: { min: 15000, max: 70000 }, sale: { min: 8000000, max: 35000000 }, lease: { min: 180000, max: 840000 } } },
  { name: 'Vile Parle West', colloquials: ['vile parle west', 'vileparle west', 'vile parle w', 'vileparle w', 'vile parle', 'vileparle'], priceBands: { rent: { min: 20000, max: 100000 }, sale: { min: 10000000, max: 50000000 }, lease: { min: 240000, max: 1200000 } } },
  { name: 'Vile Parle East', colloquials: ['vile parle east', 'vileparle east', 'vile parle e', 'vileparle e'], priceBands: { rent: { min: 15000, max: 70000 }, sale: { min: 7000000, max: 35000000 }, lease: { min: 180000, max: 840000 } } },
  { name: 'Sion', colloquials: ['sion'], priceBands: { rent: { min: 15000, max: 70000 }, sale: { min: 7000000, max: 30000000 }, lease: { min: 180000, max: 840000 } } },
  { name: 'Kurla', colloquials: ['kurla'], priceBands: { rent: { min: 10000, max: 50000 }, sale: { min: 5000000, max: 20000000 }, lease: { min: 120000, max: 600000 } } },
  { name: 'Chembur', colloquials: ['chembur'], priceBands: { rent: { min: 15000, max: 80000 }, sale: { min: 8000000, max: 35000000 }, lease: { min: 180000, max: 960000 } } },
  { name: 'Vashi', colloquials: ['vashi'], priceBands: { rent: { min: 12000, max: 50000 }, sale: { min: 6000000, max: 25000000 }, lease: { min: 144000, max: 600000 } } },
  { name: 'Nerul', colloquials: ['nerul'], priceBands: { rent: { min: 10000, max: 45000 }, sale: { min: 5000000, max: 20000000 }, lease: { min: 120000, max: 540000 } } },
  { name: 'Kharghar', colloquials: ['kharghar'], priceBands: { rent: { min: 10000, max: 40000 }, sale: { min: 4500000, max: 20000000 }, lease: { min: 120000, max: 480000 } } },
  { name: 'Panvel', colloquials: ['panvel'], priceBands: { rent: { min: 8000, max: 30000 }, sale: { min: 3000000, max: 12000000 }, lease: { min: 96000, max: 360000 } } },
  { name: 'Airoli', colloquials: ['airoli'], priceBands: { rent: { min: 8000, max: 30000 }, sale: { min: 3500000, max: 15000000 }, lease: { min: 96000, max: 360000 } } },
  { name: 'Ghansoli', colloquials: ['ghansoli'], priceBands: { rent: { min: 8000, max: 25000 }, sale: { min: 3000000, max: 12000000 }, lease: { min: 96000, max: 300000 } } },
  { name: 'Dombivali', colloquials: ['dombivali', 'dombivli'], priceBands: { rent: { min: 7000, max: 25000 }, sale: { min: 2500000, max: 10000000 }, lease: { min: 84000, max: 300000 } } },
  { name: 'Kalyan', colloquials: ['kalyan', 'kalyan west', 'kalyan east'], priceBands: { rent: { min: 6000, max: 20000 }, sale: { min: 2000000, max: 8000000 }, lease: { min: 72000, max: 240000 } } },
  { name: 'Oshiwara', colloquials: ['oshiwara'], priceBands: { rent: { min: 20000, max: 100000 }, sale: { min: 10000000, max: 50000000 }, lease: { min: 240000, max: 1200000 } } },
  { name: 'Lokhandwala', colloquials: ['lokhandwala', 'lokhandwala complex'], priceBands: { rent: { min: 25000, max: 120000 }, sale: { min: 12000000, max: 60000000 }, lease: { min: 300000, max: 1440000 } } },
  { name: 'Hiranandani Gardens', colloquials: ['hiranandani gardens', 'hiranandani', 'hiranandani estate'], priceBands: { rent: { min: 25000, max: 120000 }, sale: { min: 12000000, max: 55000000 }, lease: { min: 300000, max: 1440000 } } },
  { name: 'Carter Road', colloquials: ['carter road', 'carters'], priceBands: { rent: { min: 60000, max: 400000 }, sale: { min: 30000000, max: 200000000 }, lease: { min: 600000, max: 4800000 } } },
  { name: '16th Road', colloquials: ['16th road', '16th rd'], priceBands: { rent: { min: 40000, max: 300000 }, sale: { min: 20000000, max: 150000000 }, lease: { min: 400000, max: 3500000 } } },
  { name: 'Pali Hill', colloquials: ['pali hill'], priceBands: { rent: { min: 80000, max: 500000 }, sale: { min: 40000000, max: 250000000 }, lease: { min: 800000, max: 6000000 } } },
  { name: 'Turner Road', colloquials: ['turner road'], priceBands: { rent: { min: 50000, max: 350000 }, sale: { min: 25000000, max: 180000000 }, lease: { min: 500000, max: 4200000 } } },
  { name: 'Linking Road', colloquials: ['linking road'], priceBands: { rent: { min: 40000, max: 300000 }, sale: { min: 20000000, max: 150000000 }, lease: { min: 400000, max: 3500000 } } },
  { name: 'Waterfield Road', colloquials: ['waterfield road'], priceBands: { rent: { min: 40000, max: 300000 }, sale: { min: 20000000, max: 150000000 }, lease: { min: 400000, max: 3500000 } } },
  { name: 'Mount Mary', colloquials: ['mount mary', 'mt mary'], priceBands: { rent: { min: 50000, max: 350000 }, sale: { min: 25000000, max: 180000000 }, lease: { min: 500000, max: 4200000 } } },
  { name: 'BKC', colloquials: ['bkc', 'bandra kurla complex'], priceBands: { rent: { min: 80000, max: 500000 }, sale: { min: 40000000, max: 300000000 }, lease: { min: 800000, max: 6000000 } } },
  { name: 'Altamount Road', colloquials: ['altamount road', 'altamount'], priceBands: { rent: { min: 100000, max: 800000 }, sale: { min: 50000000, max: 400000000 }, lease: { min: 1200000, max: 9600000 } } },
  { name: 'Carmichael Road', colloquials: ['carmichael road'], priceBands: { rent: { min: 100000, max: 800000 }, sale: { min: 50000000, max: 400000000 }, lease: { min: 1200000, max: 9600000 } } },
  { name: 'Nepean Sea Road', colloquials: ['nepean sea road', 'napian sea road'], priceBands: { rent: { min: 80000, max: 600000 }, sale: { min: 40000000, max: 300000000 }, lease: { min: 960000, max: 7200000 } } },
  { name: 'Breach Candy', colloquials: ['breach candy'], priceBands: { rent: { min: 80000, max: 600000 }, sale: { min: 40000000, max: 300000000 }, lease: { min: 960000, max: 7200000 } } },
];

export const MUMBAI_LOCALITIES: string[] = LOCALITY_DATA.map((l) => l.name);

export const LOCALITIES = { mumbai: MUMBAI_LOCALITIES } as const;

export function findLocality(input: string): LocalityInfo | null {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return null;
  return LOCALITY_DATA.find((l) => l.colloquials.some((c) => normalized.includes(c) || c.includes(normalized))) ?? null;
}

export function validateLocalityPrice(locality: LocalityInfo, dealType: 'rent' | 'sale' | 'lease', price: number): { valid: boolean; message: string } {
  const band = locality.priceBands[dealType];
  if (price < band.min) {
    const formatted = new Intl.NumberFormat('en-IN').format(band.min);
    return { valid: false, message: `Price seems low for ${locality.name} ${dealType}s — did you mean ₹${formatted}?` };
  }
  if (price > band.max) {
    const formatted = new Intl.NumberFormat('en-IN').format(band.max);
    return { valid: false, message: `Price seems high for ${locality.name} ${dealType}s — typical max is ₹${formatted}` };
  }
  return { valid: true, message: 'Price looks reasonable for this locality' };
}
