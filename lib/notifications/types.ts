export interface NotificationPayload {
  title: string;
  body: string;
  tags?: string[];
  priority?: 1 | 2 | 3 | 4 | 5;
  url?: string;
}

export interface NotificationProvider {
  name: string;
  isConfigured(): boolean;
  send(payload: NotificationPayload): Promise<void>;
}
