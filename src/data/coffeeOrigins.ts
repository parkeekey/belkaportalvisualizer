export interface CoffeeOrigin {
  name: string;
  region: 'Africa' | 'Asia-Pacific' | 'Central-America' | 'South-America' | 'Caribbean';
  subregion?: string;
}

export const COFFEE_ORIGINS: CoffeeOrigin[] = [
  // ── Africa ──
  { name: 'Ethiopia', region: 'Africa', subregion: 'East Africa' },
  { name: 'Kenya', region: 'Africa', subregion: 'East Africa' },
  { name: 'Tanzania', region: 'Africa', subregion: 'East Africa' },
  { name: 'Uganda', region: 'Africa', subregion: 'East Africa' },
  { name: 'Rwanda', region: 'Africa', subregion: 'East Africa' },
  { name: 'Burundi', region: 'Africa', subregion: 'East Africa' },
  { name: 'Malawi', region: 'Africa', subregion: 'East Africa' },
  { name: 'Zambia', region: 'Africa', subregion: 'East Africa' },
  { name: 'Zimbabwe', region: 'Africa', subregion: 'East Africa' },
  { name: 'South Sudan', region: 'Africa', subregion: 'East Africa' },
  { name: 'Democratic Republic of the Congo', region: 'Africa', subregion: 'Central Africa' },
  { name: 'Congo (Republic)', region: 'Africa', subregion: 'Central Africa' },
  { name: 'Cameroon', region: 'Africa', subregion: 'West Africa' },
  { name: 'Nigeria', region: 'Africa', subregion: 'West Africa' },
  { name: "Côte d'Ivoire", region: 'Africa', subregion: 'West Africa' },
  { name: 'Ghana', region: 'Africa', subregion: 'West Africa' },
  { name: 'Guinea', region: 'Africa', subregion: 'West Africa' },
  { name: 'Liberia', region: 'Africa', subregion: 'West Africa' },
  { name: 'Sierra Leone', region: 'Africa', subregion: 'West Africa' },
  { name: 'Togo', region: 'Africa', subregion: 'West Africa' },
  { name: 'Angola', region: 'Africa', subregion: 'Central Africa' },
  { name: 'Madagascar', region: 'Africa', subregion: 'East Africa' },
  { name: 'Mozambique', region: 'Africa', subregion: 'East Africa' },
  { name: 'Central African Republic', region: 'Africa', subregion: 'Central Africa' },
  { name: 'Gabon', region: 'Africa', subregion: 'Central Africa' },
  { name: 'São Tomé and Príncipe', region: 'Africa', subregion: 'Central Africa' },
  { name: 'Equatorial Guinea', region: 'Africa', subregion: 'Central Africa' },
  { name: 'Burkina Faso', region: 'Africa', subregion: 'West Africa' },
  { name: 'South Africa', region: 'Africa', subregion: 'Southern Africa' },

  // ── Asia-Pacific ──
  { name: 'Indonesia', region: 'Asia-Pacific', subregion: 'Southeast Asia' },
  { name: 'Vietnam', region: 'Asia-Pacific', subregion: 'Southeast Asia' },
  { name: 'India', region: 'Asia-Pacific', subregion: 'South Asia' },
  { name: 'Papua New Guinea', region: 'Asia-Pacific', subregion: 'Oceania' },
  { name: 'Philippines', region: 'Asia-Pacific', subregion: 'Southeast Asia' },
  { name: 'Thailand', region: 'Asia-Pacific', subregion: 'Southeast Asia' },
  { name: 'Myanmar (Burma)', region: 'Asia-Pacific', subregion: 'Southeast Asia' },
  { name: 'Laos', region: 'Asia-Pacific', subregion: 'Southeast Asia' },
  { name: 'Cambodia', region: 'Asia-Pacific', subregion: 'Southeast Asia' },
  { name: 'China', region: 'Asia-Pacific', subregion: 'East Asia' },
  { name: 'Taiwan', region: 'Asia-Pacific', subregion: 'East Asia' },
  { name: 'Japan', region: 'Asia-Pacific', subregion: 'East Asia' },
  { name: 'Malaysia', region: 'Asia-Pacific', subregion: 'Southeast Asia' },
  { name: 'Timor-Leste', region: 'Asia-Pacific', subregion: 'Southeast Asia' },
  { name: 'Sri Lanka', region: 'Asia-Pacific', subregion: 'South Asia' },
  { name: 'Nepal', region: 'Asia-Pacific', subregion: 'South Asia' },
  { name: 'Yemen', region: 'Asia-Pacific', subregion: 'Arabian Peninsula' },
  { name: 'Hawaii (United States)', region: 'Asia-Pacific', subregion: 'Oceania' },

  // ── Central America ──
  { name: 'Guatemala', region: 'Central-America', subregion: 'Central America' },
  { name: 'Costa Rica', region: 'Central-America', subregion: 'Central America' },
  { name: 'Honduras', region: 'Central-America', subregion: 'Central America' },
  { name: 'Nicaragua', region: 'Central-America', subregion: 'Central America' },
  { name: 'El Salvador', region: 'Central-America', subregion: 'Central America' },
  { name: 'Panama', region: 'Central-America', subregion: 'Central America' },
  { name: 'Mexico', region: 'Central-America', subregion: 'Central America' },
  { name: 'Belize', region: 'Central-America', subregion: 'Central America' },

  // ── South America ──
  { name: 'Brazil', region: 'South-America', subregion: 'South America' },
  { name: 'Colombia', region: 'South-America', subregion: 'South America' },
  { name: 'Peru', region: 'South-America', subregion: 'South America' },
  { name: 'Bolivia', region: 'South-America', subregion: 'South America' },
  { name: 'Ecuador', region: 'South-America', subregion: 'South America' },
  { name: 'Venezuela', region: 'South-America', subregion: 'South America' },
  { name: 'Guyana', region: 'South-America', subregion: 'South America' },
  { name: 'Suriname', region: 'South-America', subregion: 'South America' },
  { name: 'French Guiana', region: 'South-America', subregion: 'South America' },

  // ── Caribbean ──
  { name: 'Jamaica', region: 'Caribbean', subregion: 'Caribbean' },
  { name: 'Cuba', region: 'Caribbean', subregion: 'Caribbean' },
  { name: 'Dominican Republic', region: 'Caribbean', subregion: 'Caribbean' },
  { name: 'Haiti', region: 'Caribbean', subregion: 'Caribbean' },
  { name: 'Puerto Rico (United States)', region: 'Caribbean', subregion: 'Caribbean' },
  { name: 'Trinidad and Tobago', region: 'Caribbean', subregion: 'Caribbean' },
  { name: 'Saint Helena', region: 'Caribbean', subregion: 'Atlantic Island' },
];

export const REGION_COLORS: Record<CoffeeOrigin['region'], { color: string; bgColor: string; textColor: string }> = {
  'Africa': { color: '#d97706', bgColor: '#fef3c7', textColor: 'text-amber-700' },
  'Asia-Pacific': { color: '#0891b2', bgColor: '#cffafe', textColor: 'text-cyan-700' },
  'Central-America': { color: '#7c3aed', bgColor: '#ede9fe', textColor: 'text-violet-700' },
  'South-America': { color: '#16a34a', bgColor: '#dcfce7', textColor: 'text-green-700' },
  'Caribbean': { color: '#e11d48', bgColor: '#ffe4e6', textColor: 'text-rose-700' },
};

export function searchOrigins(query: string): CoffeeOrigin[] {
  if (!query.trim()) return COFFEE_ORIGINS;
  const q = query.toLowerCase();
  return COFFEE_ORIGINS.filter(o =>
    o.name.toLowerCase().includes(q) ||
    o.region.toLowerCase().replace('-', ' ').includes(q) ||
    (o.subregion && o.subregion.toLowerCase().includes(q))
  );
}
