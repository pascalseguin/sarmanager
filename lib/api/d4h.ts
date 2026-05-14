import axios from 'axios';

const D4H_BASE = 'https://api.team-manager.us.d4h.com/v3';

export class D4HAPI {
  constructor(private token: string) {}

  async getIncidents() {
    return axios.get(`${D4H_BASE}/incidents`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
  }

  async getPersonnel() {
    return axios.get(`${D4H_BASE}/personnel`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
  }

  async createTask(taskData: any) {
    return axios.post(`${D4H_BASE}/tasks`, taskData, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
  }
}