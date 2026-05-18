export interface PasswordEntry {
  id: string; // random identifier
  password: string;
  login: string; // username / email
  tags: number[]; // max (10)
  url: string;
}
