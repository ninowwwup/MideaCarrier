export type UserRole = 'midea' | 'buiatte';

export interface AuthUser {
  username: 'Admin' | 'Prod';
  role: UserRole;
  displayName: string;
  teamName: string;
  subtitle: string;
  loginTime: string;
}

export interface LoginCredentials {
  login: string;
  password: string;
}

export const VALID_USERS: Record<string, { role: UserRole; username: 'Admin' | 'Prod'; passwordHashOrPlain: string; displayName: string; teamName: string; subtitle: string }> = {
  admin: {
    username: 'Admin',
    role: 'midea',
    passwordHashOrPlain: 'Mid12211221',
    displayName: 'Time Midea (Admin)',
    teamName: 'Time Midea (SAP MIGO)',
    subtitle: 'Administrador • Central SAP MIGO & Gestão Global',
  },
  prod: {
    username: 'Prod',
    role: 'buiatte',
    passwordHashOrPlain: 'Bui45695878',
    displayName: 'Time Buiatte (Prod)',
    teamName: 'Time Buiatte (Sênior WMS)',
    subtitle: 'Operação • Solicitações & Chão de Fábrica WMS',
  },
};
