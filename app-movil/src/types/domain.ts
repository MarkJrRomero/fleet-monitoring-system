export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
};

export type Session = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  username: string;
  roles: string[];
};

export type Vehicle = {
  vehicle_id: string;
  imei?: string;
  lat: number;
  lng: number;
  status?: string;
};

export type PositionEvent = {
  vehicle_id: string;
  lat: number;
  lng: number;
  speed_kmh?: number;
  status?: string;
  panic_button?: boolean;
  recorded_at: string;
};

export type AlertEvent = {
  type?: string;
  vehicle_id: string;
  lat: number;
  lng: number;
  detected_at?: string;
  message?: string;
};

export type LocalAlert = {
  id: string;
  vehicleId: string;
  type: string;
  message: string;
  detectedAt: string;
  source: 'panic_local' | 'backend_ws';
};

export type TripState = {
  active: boolean;
  startedAt?: number;
  distanceKm: number;
  lastPoint?: {
    lat: number;
    lng: number;
  };
};
