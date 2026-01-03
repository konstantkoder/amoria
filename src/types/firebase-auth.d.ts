declare module "firebase/auth" {
  export interface User {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
  }

  export interface UserCredential {
    user: User;
  }

  export interface Auth {
    currentUser: User | null;
  }

  export function initializeAuth(app: any, options: { persistence: any }): Auth;
  export function getAuth(app?: any): Auth;
  export function getReactNativePersistence(storage: any): any;
  export function onAuthStateChanged(
    auth: Auth,
    nextOrObserver: (user: User | null) => void,
    error?: (error: Error) => void,
  ): () => void;
  export function signInWithEmailAndPassword(
    auth: Auth,
    email: string,
    password: string,
  ): Promise<UserCredential>;
  export function createUserWithEmailAndPassword(
    auth: Auth,
    email: string,
    password: string,
  ): Promise<UserCredential>;
  export function signOut(auth: Auth): Promise<void>;
  export function signInAnonymously(auth: Auth): Promise<UserCredential>;
  export function deleteUser(user: User): Promise<void>;
}
