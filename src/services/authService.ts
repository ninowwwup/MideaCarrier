import { AuthUser, VALID_USERS } from '../types/auth';

const AUTH_STORAGE_KEY = 'migou_auth_session_v1';

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.username === 'Admin' || parsed.username === 'Prod')) {
      return parsed as AuthUser;
    }
  } catch (e) {
    console.warn('Erro ao ler sessão de autenticação:', e);
  }
  return null;
}

export function saveStoredUser(user: AuthUser): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  } catch (e) {
    console.warn('Erro ao salvar sessão de autenticação:', e);
  }
}

export function clearStoredUser(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch (e) {
    console.warn('Erro ao limpar sessão de autenticação:', e);
  }
}

export function authenticateUser(loginInput: string, passwordInput: string): {
  success: boolean;
  user?: AuthUser;
  error?: string;
} {
  const cleanLogin = loginInput.trim().toLowerCase();
  const cleanPass = passwordInput.trim();

  if (!cleanLogin || !cleanPass) {
    return { success: false, error: 'Por favor, informe o usuário e a senha.' };
  }

  // Permite flexibilidade de digitação (ex: Admin ou Midea, Prod ou Buiatte)
  let userKey: 'admin' | 'prod' | null = null;
  if (cleanLogin === 'admin' || cleanLogin === 'midea') {
    userKey = 'admin';
  } else if (cleanLogin === 'prod' || cleanLogin === 'buiatte') {
    userKey = 'prod';
  }

  if (!userKey) {
    return {
      success: false,
      error: 'Usuário não reconhecido. Utilize "Admin" (para Midea) ou "Prod" (para Buiatte).'
    };
  }

  const validData = VALID_USERS[userKey];
  if (cleanPass !== validData.passwordHashOrPlain) {
    return {
      success: false,
      error: 'Senha incorreta para este usuário. Verifique as credenciais e tente novamente.'
    };
  }

  const authUser: AuthUser = {
    username: validData.username,
    role: validData.role,
    displayName: validData.displayName,
    teamName: validData.teamName,
    subtitle: validData.subtitle,
    loginTime: new Date().toISOString(),
  };

  saveStoredUser(authUser);
  return { success: true, user: authUser };
}

export function hasAdminPrivileges(user: AuthUser | null): boolean {
  return user?.role === 'midea' || user?.username === 'Admin';
}
