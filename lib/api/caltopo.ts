import axios from 'axios';

const CALTOPO_BASE = 'https://caltopo.com/api/v1';

export class CalTopoAPI {
  constructor(private teamId: string, private secret: string) {}

  private signRequest(path: string, timestamp: number): string {
    // TODO: Implement HMAC-SHA256 signing
    // const message = `${timestamp}${path}`;
    // const signature = crypto.createHmac('sha256', this.secret).update(message).digest('hex');
    return 'placeholder_signature';
  }

  async getAccountData(since: number) {
    const timestamp = Date.now();
    const path = `/acct/${this.teamId}/since/${since}`;
    const sig = this.signRequest(path, timestamp);

    return axios.get(`${CALTOPO_BASE}${path}`, {
      headers: {
        'X-Request-Time': timestamp.toString(),
        'X-Request-Signature': sig,
      },
    });
  }

  async createMap(mapData: any) {
    // Placeholder
    return axios.post(`${CALTOPO_BASE}/map`, mapData, {
      headers: {
        'X-Request-Time': Date.now().toString(),
        'X-Request-Signature': this.signRequest('/map', Date.now()),
      },
    });
  }
}