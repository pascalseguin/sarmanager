'use client';

export interface Operation {
  id: string;
  name: string;
  status: 'active' | 'standby' | 'closed';
  operation_type: 'search' | 'rescue' | 'recovery' | 'assist';
  priority: 1 | 2 | 3;
  started_at: string;
  created_at: string;
  updated_at: string;
  // Dispatch
  tasking_agency?: string;
  oic_name?: string;
  oic_phone?: string;
  // WHO
  lost_person_name?: string;
  lost_person_age?: number;
  subject_sex?: string;
  subject_clothing?: string;
  subject_gear?: string;
  lost_person_description?: string;
  // WHERE / WHEN
  pls_location?: string;
  pls_lat?: number;
  pls_lon?: number;
  pls_time?: string;
  reported_time?: string;
  last_seen_location?: string;
  latitude?: number;   // LKP lat
  longitude?: number;  // LKP lon
  lkp_utm?: string;
  ipp_type?: 'pls' | 'lkp';
  // CONDITION
  subject_circumstance?: string;
  subject_condition?: string;
  // SAFETY
  safety_concerns?: string;
  // Profile
  subject_category?: string;
  terrain_type?: string;
  // CalTopo
  caltopo_map_id?: string;
  caltopo_map_url?: string;
  // D4H
  d4h_incident_id?: string;
  d4h_exercise_id?: string;
  d4h_activity_type?: 'incident' | 'exercise';
  d4h_callout_id?: string;
  // Deploy
  deploy_decision?: 'yes' | 'no' | null;
  deploy_timestamp?: string;
  // Weather snapshot at deploy time
  weather_snapshot?: string;
  // Tags
  tags?: string[];
  // Deployed equipment (D4H equipment item IDs selected at operation creation)
  deployed_equipment_ids?: number[];
}

const KEY = 'sarmanager_operations';

function load(): Operation[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

function save(ops: Operation[]) {
  localStorage.setItem(KEY, JSON.stringify(ops));
}

export const operationsStore = {
  list(): Operation[] {
    return load().sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  get(id: string): Operation | null {
    return load().find(o => o.id === id) ?? null;
  },

  create(data: Omit<Operation, 'id' | 'created_at' | 'updated_at' | 'started_at' | 'status'>): Operation {
    const now = new Date().toISOString();
    const op: Operation = {
      ...data,
      id: crypto.randomUUID(),
      status: 'active',
      started_at: now,
      created_at: now,
      updated_at: now,
    };
    const ops = load();
    ops.unshift(op);
    save(ops);
    return op;
  },

  update(id: string, patch: Partial<Operation>): Operation | null {
    const ops = load();
    const idx = ops.findIndex(o => o.id === id);
    if (idx === -1) return null;
    ops[idx] = { ...ops[idx], ...patch, updated_at: new Date().toISOString() };
    save(ops);
    return ops[idx];
  },

  close(id: string): void {
    this.update(id, { status: 'closed' });
  },
};
