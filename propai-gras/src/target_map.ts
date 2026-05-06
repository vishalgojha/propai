/**
 * PropAI GRAS - MMR & PUNE Target Map
 * 
 * Districts and SROs for high-scale scraping.
 */

export interface SROTarget {
    district: string;
    taluka?: string;
    sro_name: string;
    priority: 'High' | 'Medium' | 'Low';
}

export const MMR_PUNE_TARGETS: SROTarget[] = [
    // --- MUMBAI SUBURBAN (High Priority) ---
    { district: "Mumbai Suburban", taluka: "Andheri", sro_name: "Andheri 1", priority: "High" },
    { district: "Mumbai Suburban", taluka: "Andheri", sro_name: "Andheri 2", priority: "High" },
    { district: "Mumbai Suburban", taluka: "Andheri", sro_name: "Andheri 3", priority: "High" },
    { district: "Mumbai Suburban", taluka: "Andheri", sro_name: "Andheri 4", priority: "High" },
    { district: "Mumbai Suburban", taluka: "Bandra", sro_name: "Bandra 1", priority: "High" },
    { district: "Mumbai Suburban", taluka: "Kurla", sro_name: "Kurla 1", priority: "High" },
    
    // --- MUMBAI CITY (Worli, etc.) ---
    { district: "Mumbai City", sro_name: "Mumbai City 2", priority: "High" }, // Worli
    { district: "Mumbai City", sro_name: "Mumbai City 3", priority: "High" },
    
    // --- NAVI MUMBAI & THANE ---
    { district: "Thane", taluka: "Thane", sro_name: "Thane 1", priority: "High" },
    { district: "Thane", taluka: "Thane", sro_name: "Thane 3", priority: "High" }, // Vashi
    { district: "Thane", taluka: "Thane", sro_name: "Thane 6", priority: "High" }, // Belapur
    
    // --- PANVEL (RAIGAD) ---
    { district: "Raigad", taluka: "Panvel", sro_name: "Panvel 1", priority: "High" },
    { district: "Raigad", taluka: "Panvel", sro_name: "Panvel 2", priority: "High" },
    
    // --- PUNE (HAVELI) ---
    { district: "Pune", taluka: "Haveli", sro_name: "Haveli 4", priority: "High" }, // Kothrud
    { district: "Pune", taluka: "Haveli", sro_name: "Haveli 21", priority: "High" }, // Baner/Wagholi area
    { district: "Pune", taluka: "Haveli", sro_name: "Haveli 22", priority: "High" }
];

export const ALL_DISTRICTS = ["Mumbai City", "Mumbai Suburban", "Thane", "Raigad", "Pune", "Palghar"];
