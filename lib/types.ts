export interface Incident {
  id: string;
  title: string;
  location: string;
  status: string;
}

export interface Personnel {
  id: string;
  name: string;
  status: string;
  qualifications: string[];
}

export interface SearchArea {
  lat: number;
  lng: number;
  radius: number;
  probability: number;
}