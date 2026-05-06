export interface SROTarget {
  district: string;
  taluka?: string;
  sroName: string;
  priority: 'High' | 'Medium' | 'Low';
}

export const MMR_PUNE_TARGETS: SROTarget[] = [
  { district: 'Mumbai Suburban', taluka: 'Andheri', sroName: 'Andheri 1', priority: 'High' },
  { district: 'Mumbai Suburban', taluka: 'Andheri', sroName: 'Andheri 2', priority: 'High' },
  { district: 'Mumbai Suburban', taluka: 'Andheri', sroName: 'Andheri 3', priority: 'High' },
  { district: 'Mumbai Suburban', taluka: 'Andheri', sroName: 'Andheri 4', priority: 'High' },
  { district: 'Mumbai Suburban', taluka: 'Bandra', sroName: 'Bandra 1', priority: 'High' },
  { district: 'Mumbai Suburban', taluka: 'Kurla', sroName: 'Kurla 1', priority: 'High' },
  { district: 'Mumbai City', sroName: 'Mumbai City 2', priority: 'High' },
  { district: 'Mumbai City', sroName: 'Mumbai City 3', priority: 'High' },
  { district: 'Thane', taluka: 'Thane', sroName: 'Thane 1', priority: 'High' },
  { district: 'Thane', taluka: 'Thane', sroName: 'Thane 3', priority: 'High' },
  { district: 'Thane', taluka: 'Thane', sroName: 'Thane 6', priority: 'High' },
  { district: 'Raigad', taluka: 'Panvel', sroName: 'Panvel 1', priority: 'High' },
  { district: 'Raigad', taluka: 'Panvel', sroName: 'Panvel 2', priority: 'High' },
  { district: 'Pune', taluka: 'Haveli', sroName: 'Haveli 4', priority: 'High' },
  { district: 'Pune', taluka: 'Haveli', sroName: 'Haveli 21', priority: 'High' },
  { district: 'Pune', taluka: 'Haveli', sroName: 'Haveli 22', priority: 'High' },
];
