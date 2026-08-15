export const CATEGORIES = [
  { id: 'home', label: 'Home Installation', icon: 'home', desc: 'Apartments, villas & independent houses' },
  { id: 'commercial', label: 'Commercial / Enterprise', icon: 'storefront', desc: 'Retail, warehouses, offices & restaurants' },
  { id: 'builder', label: 'Builder / Developer', icon: 'apartment', desc: 'Real estate projects & bulk rollouts' },
  { id: 'retrofit', label: 'Retrofitting', icon: 'construction', desc: 'Upgrade existing switchboards' }
];

export const CATEGORY_FIELDS = {
  home: [
    { key: 'propertyType', label: 'Property Type', type: 'select', options: ['Apartment', 'Villa', 'Duplex', 'Independent House', 'Other'] },
    { key: 'floors', label: 'Number of Floors', type: 'number', placeholder: 'e.g. 2' },
    { key: 'rooms', label: 'Number of Rooms', type: 'number', placeholder: 'e.g. 6' },
    { key: 'switchboards', label: 'Switchboards to Automate', type: 'number', placeholder: 'e.g. 4' },
    { key: 'wiring', label: 'Current Wiring', type: 'select', options: ['Standard wiring', 'Modular switches', 'Not sure'] },
    { key: 'wifi', label: 'Wi-Fi Available Near Switchboards?', type: 'select', options: ['Yes', 'No', 'Not sure'] },
    { key: 'timeline', label: 'Preferred Timeline', type: 'select', options: ['ASAP', 'Within 1 month', 'Within 3 months', 'Just exploring'] }
  ],
  commercial: [
    { key: 'businessType', label: 'Business Type', type: 'select', options: ['Retail store', 'Warehouse', 'Office', 'Restaurant / Cafe', 'Hotel', 'Other'] },
    { key: 'sites', label: 'Number of Sites', type: 'number', placeholder: 'e.g. 3' },
    { key: 'areaSqFt', label: 'Approx. Area (sq ft)', type: 'number', placeholder: 'e.g. 2500' },
    { key: 'currentSystem', label: 'Current System', type: 'select', options: ['Manual switches', 'Existing IoT / automation', 'None'] },
    { key: 'monthlyBill', label: 'Approx. Monthly Electricity Bill (₹)', type: 'number', placeholder: 'e.g. 80000' },
    { key: 'timeline', label: 'Deployment Timeline', type: 'select', options: ['ASAP', 'Within 1 month', 'Within 3 months', 'Planning phase'] }
  ],
  builder: [
    { key: 'projectName', label: 'Project Name', type: 'text', placeholder: 'e.g. Green Valley Residency' },
    { key: 'units', label: 'Number of Units', type: 'number', placeholder: 'e.g. 120' },
    { key: 'stage', label: 'Project Stage', type: 'select', options: ['Planning', 'Under construction', 'Ready to occupy'] },
    { key: 'cities', label: 'Target Cities', type: 'text', placeholder: 'e.g. Hyderabad, Bengaluru' },
    { key: 'timeline', label: 'Rollout Timeline', type: 'select', options: ['This quarter', 'This year', 'Next year', 'Exploring'] }
  ],
  retrofit: [
    { key: 'boardCount', label: 'Switchboards to Upgrade', type: 'number', placeholder: 'e.g. 8' },
    { key: 'buildingAge', label: 'Building Age', type: 'select', options: ['Less than 5 years', '5–15 years', 'More than 15 years'] },
    { key: 'occupancy', label: 'Occupancy Status', type: 'select', options: ['Currently occupied', 'Vacant / new construction'] },
    { key: 'currentSystem', label: 'Current System', type: 'select', options: ['Manual switches', 'Existing IoT / automation'] },
    { key: 'timeline', label: 'Preferred Timeline', type: 'select', options: ['ASAP', 'Within 1 month', 'Within 3 months', 'Just exploring'] }
  ]
};

export const DETAIL_LABELS = {
  propertyType: 'Property Type',
  floors: 'Floors',
  rooms: 'Rooms',
  switchboards: 'Switchboards',
  wiring: 'Wiring',
  wifi: 'Wi-Fi Available',
  timeline: 'Timeline',
  businessType: 'Business Type',
  sites: 'Sites',
  areaSqFt: 'Area (sq ft)',
  currentSystem: 'Current System',
  monthlyBill: 'Monthly Bill (₹)',
  projectName: 'Project Name',
  units: 'Units',
  stage: 'Project Stage',
  cities: 'Target Cities',
  boardCount: 'Switchboards',
  buildingAge: 'Building Age',
  occupancy: 'Occupancy'
};

export const CATEGORY_LABELS = {
  home: 'Home Installation',
  commercial: 'Commercial / Enterprise',
  builder: 'Builder / Developer',
  retrofit: 'Retrofitting'
};

export const STAGES = ['Received', 'Survey', 'Quoting', 'Manufacturing', 'Shipping', 'Installed'];

export function generateOrderId() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `EW-${ts}${rand}`;
}