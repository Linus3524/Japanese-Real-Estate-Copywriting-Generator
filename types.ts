
export enum ListingMode {
  RENTAL = 'RENTAL',
  SALE = 'SALE',
}

export interface PropertyData {
  station: string;
  line: string;
  walkTime: string;
  price: string; // Rent or Sale Price
  keyMoney: string; // Reikin (Rental)
  deposit: string;  // Shikikin (Rental)
  managementFee: string; // Kanri-hi (Rental/Sale)
  repairFund: string; // Shuuzen-tsumitate-kin (Sale)
  layout: string; // e.g., 1K, 2LDK
  size: string; // m2 (専有面積)
  balconySize: string; // Balcony size m2
  floor: string; // Current unit floor
  totalFloors: string; // Total floors in building
  age: string; // Building age or year
  address: string;
  moveInDate: string; // Available date / Handover
  renovationDate: string; // Renovation completion date
  features: string;
}

export interface TerminologyItem {
  id: string;
  japanese: string;
  taiwanese: string;
}

export interface SavedListing {
  id: string;
  title: string;
  text: string;
  mode: ListingMode;
}

export interface HashtagSet {
  rental: string;
  sale: string;
}
