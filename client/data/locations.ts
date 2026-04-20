export interface City {
  name: string;
}

export interface State {
  name: string;
  cities: City[];
}

export interface Country {
  name: string;
  code: string;
  states: State[];
}

export const LOCATIONS: Country[] = [
  {
    name: "India",
    code: "IN",
    states: [
      {
        name: "Andhra Pradesh",
        cities: [
          { name: "Hyderabad" },
          { name: "Vijayawada" },
          { name: "Visakhapatnam" },
          { name: "Tirupati" },
        ],
      },
      {
        name: "Delhi",
        cities: [
          { name: "New Delhi" },
          { name: "Delhi" },
          { name: "Gurugram" },
          { name: "Noida" },
        ],
      },
      {
        name: "Gujarat",
        cities: [
          { name: "Ahmedabad" },
          { name: "Surat" },
          { name: "Vadodara" },
          { name: "Rajkot" },
        ],
      },
      {
        name: "Karnataka",
        cities: [
          { name: "Bangalore" },
          { name: "Mysore" },
          { name: "Mangalore" },
          { name: "Hubli" },
        ],
      },
      {
        name: "Maharashtra",
        cities: [
          { name: "Mumbai" },
          { name: "Pune" },
          { name: "Nagpur" },
          { name: "Aurangabad" },
        ],
      },
      {
        name: "Tamil Nadu",
        cities: [
          { name: "Chennai" },
          { name: "Coimbatore" },
          { name: "Madurai" },
          { name: "Salem" },
        ],
      },
      {
        name: "Telangana",
        cities: [
          { name: "Hyderabad" },
          { name: "Warangal" },
          { name: "Khammam" },
        ],
      },
      {
        name: "West Bengal",
        cities: [
          { name: "Kolkata" },
          { name: "Asansol" },
          { name: "Siliguri" },
        ],
      },
      {
        name: "Punjab",
        cities: [
          { name: "Chandigarh" },
          { name: "Amritsar" },
          { name: "Ludhiana" },
        ],
      },
      {
        name: "Uttar Pradesh",
        cities: [
          { name: "Lucknow" },
          { name: "Kanpur" },
          { name: "Varanasi" },
          { name: "Agra" },
        ],
      },
    ],
  },
  {
    name: "United States",
    code: "US",
    states: [
      {
        name: "California",
        cities: [
          { name: "San Francisco" },
          { name: "Los Angeles" },
          { name: "San Diego" },
          { name: "Sacramento" },
        ],
      },
      {
        name: "New York",
        cities: [
          { name: "New York City" },
          { name: "Buffalo" },
          { name: "Albany" },
        ],
      },
      {
        name: "Texas",
        cities: [
          { name: "Houston" },
          { name: "Dallas" },
          { name: "Austin" },
          { name: "San Antonio" },
        ],
      },
      {
        name: "Florida",
        cities: [
          { name: "Miami" },
          { name: "Orlando" },
          { name: "Tampa" },
        ],
      },
      {
        name: "Illinois",
        cities: [
          { name: "Chicago" },
          { name: "Springfield" },
        ],
      },
      {
        name: "Washington",
        cities: [
          { name: "Seattle" },
          { name: "Spokane" },
          { name: "Tacoma" },
        ],
      },
      {
        name: "Massachusetts",
        cities: [
          { name: "Boston" },
          { name: "Worcester" },
        ],
      },
    ],
  },
  {
    name: "United Arab Emirates",
    code: "AE",
    states: [
      {
        name: "Dubai",
        cities: [
          { name: "Dubai Downtown" },
          { name: "Deira" },
          { name: "Bur Dubai" },
          { name: "Dubai Marina" },
          { name: "Jumeirah" },
        ],
      },
      {
        name: "Abu Dhabi",
        cities: [
          { name: "Abu Dhabi" },
          { name: "Al Ain" },
        ],
      },
      {
        name: "Sharjah",
        cities: [
          { name: "Sharjah" },
          { name: "Ajman" },
        ],
      },
    ],
  },
  {
    name: "Saudi Arabia",
    code: "SA",
    states: [
      {
        name: "Riyadh",
        cities: [
          { name: "Riyadh" },
        ],
      },
      {
        name: "Mecca",
        cities: [
          { name: "Mecca" },
        ],
      },
      {
        name: "Medina",
        cities: [
          { name: "Medina" },
        ],
      },
      {
        name: "Jeddah",
        cities: [
          { name: "Jeddah" },
        ],
      },
    ],
  },
  {
    name: "Qatar",
    code: "QA",
    states: [
      {
        name: "Doha",
        cities: [
          { name: "Doha" },
          { name: "Al Wakrah" },
          { name: "Al Rayyan" },
        ],
      },
    ],
  },
  {
    name: "Kuwait",
    code: "KW",
    states: [
      {
        name: "Kuwait City",
        cities: [
          { name: "Kuwait City" },
          { name: "Salmiya" },
        ],
      },
    ],
  },
  {
    name: "Bahrain",
    code: "BH",
    states: [
      {
        name: "Manama",
        cities: [
          { name: "Manama" },
          { name: "Muharraq" },
        ],
      },
    ],
  },
  {
    name: "Oman",
    code: "OM",
    states: [
      {
        name: "Muscat",
        cities: [
          { name: "Muscat" },
          { name: "Seeb" },
        ],
      },
    ],
  },
  {
    name: "Egypt",
    code: "EG",
    states: [
      {
        name: "Cairo",
        cities: [
          { name: "Cairo" },
          { name: "Giza" },
        ],
      },
      {
        name: "Alexandria",
        cities: [
          { name: "Alexandria" },
        ],
      },
    ],
  },
  {
    name: "Nigeria",
    code: "NG",
    states: [
      {
        name: "Lagos",
        cities: [
          { name: "Lagos" },
          { name: "Ikeja" },
        ],
      },
      {
        name: "Abuja",
        cities: [
          { name: "Abuja" },
        ],
      },
    ],
  },
];

export function getCountries(): string[] {
  return LOCATIONS.map((c) => c.name);
}

export function getStates(countryName: string): string[] {
  const country = LOCATIONS.find((c) => c.name === countryName);
  return country ? country.states.map((s) => s.name) : [];
}

export function getCities(countryName: string, stateName: string): string[] {
  const country = LOCATIONS.find((c) => c.name === countryName);
  if (!country) return [];
  const state = country.states.find((s) => s.name === stateName);
  return state ? state.cities.map((c) => c.name) : [];
}
