
import React from 'react';

export const INITIAL_PROPERTY_DATA = {
  station: "",
  line: "",
  walkTime: "",
  price: "",
  keyMoney: "",
  deposit: "",
  managementFee: "",
  repairFund: "",
  layout: "",
  size: "",
  balconySize: "",
  floor: "",
  totalFloors: "",
  age: "",
  address: "",
  moveInDate: "",
  renovationDate: "",
  features: "",
};

export const PLACEHOLDER_IMAGE = "https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80";

export const ASPECT_RATIO_STYLES: Record<string, React.CSSProperties> = {
  '1:1': { aspectRatio: '1 / 1' },
  '4:5': { aspectRatio: '4 / 5' },
  '16:9': { aspectRatio: '16 / 9' },
  '3:4': { aspectRatio: '3 / 4' },
  '4:3': { aspectRatio: '4 / 3' },
  '9:16': { aspectRatio: '9 / 16' },
  '5:4': { aspectRatio: '5 / 4' },
  'A4': { aspectRatio: '210 / 297' }, // Standard A4 ratio
};
