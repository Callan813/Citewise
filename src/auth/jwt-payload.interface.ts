// What's inside the token. It is signed, not encrypted: anyone can decode and
// read it (try pasting one into jwt.io), so never put secrets in here.
export interface JwtPayload {
  sub: string; // "subject": the user id, by JWT convention
  email: string;
}
