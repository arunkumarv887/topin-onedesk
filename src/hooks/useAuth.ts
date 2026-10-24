import { useState, useEffect } from 'react'; 
import {
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  onAuthStateChanged,
  sendPasswordResetEmail,
  confirmPasswordReset,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc, collection, getCountFromServer } from 'firebase/firestore';
import type { User as FirebaseUser } from 'firebase/auth';
import { auth, db } from '../config/firebase';
import { ADMIN_EMAIL } from '../config/admin';
import type { UserProfile } from '../types/asset';
import { logActivityEvent } from '../utils/activityLogs';

const MAX_REGISTERED_USERS = 100000;

const DEFAULT_ADMIN_PROFILE = {
  displayName: 'IT Admin',
  employeeName: 'IT Admin',
  employeeId: 'ITADMIN',
  department: 'IT',
  mobile: 'N/A',
};

const isAdminEmail = (email?: string | null) => {
  return !!email && email.toLowerCase() === ADMIN_EMAIL;
};

const getCurrentRegisteredUserCount = async (): Promise<number> => {
  try {
    const usersRef = collection(db, 'users');
    const snapshot = await getCountFromServer(usersRef);
    return snapshot.data().count ?? 0;
  } catch (error) {
    console.warn('Unable to fetch registered user count:', error);
    return 0;
  }
};

export const useAuth = () => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      // Treat unverified users as not logged in so they cannot access the app
      if (currentUser && !currentUser.emailVerified) {
        setUser(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setUser(currentUser);
      setIsAdmin(isAdminEmail(currentUser?.email ?? null));
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      setError(null);
      const credential = await signInWithEmailAndPassword(auth, email, password);
      // Prevent login if email not verified
      if (!credential.user.emailVerified) {
        await signOut(auth);
        setError('Please verify your email before logging in.');
        return false;
      }

      const profileRef = doc(db, 'users', credential.user.uid);
      const profileSnap = await getDoc(profileRef);
      const isAdminUser = isAdminEmail(credential.user.email);

      if (isAdminUser) {
        await setDoc(profileRef, {
          uid: credential.user.uid,
          email: credential.user.email,
          displayName: DEFAULT_ADMIN_PROFILE.displayName,
          employeeName: DEFAULT_ADMIN_PROFILE.employeeName,
          employeeId: DEFAULT_ADMIN_PROFILE.employeeId,
          mobile: DEFAULT_ADMIN_PROFILE.mobile,
          department: DEFAULT_ADMIN_PROFILE.department,
          emailVerified: credential.user.emailVerified,
          updatedAt: serverTimestamp(),
          ...(profileSnap.exists() ? {} : { createdAt: serverTimestamp() }),
        }, { merge: true });
      } else if (!profileSnap.exists()) {
        try {
          const pending = typeof window !== 'undefined'
            ? window.localStorage.getItem('pendingProfile')
            : null;
          if (pending) {
            const pendingProfile = JSON.parse(pending) as Partial<UserProfile>;
            await setDoc(profileRef, {
              uid: credential.user.uid,
              email: credential.user.email,
              displayName: pendingProfile.displayName || pendingProfile.employeeName || credential.user.displayName || '',
              employeeName: pendingProfile.displayName || pendingProfile.employeeName || credential.user.displayName || '',
              employeeId: pendingProfile.employeeId || '',
              mobile: pendingProfile.mobile || '',
              department: pendingProfile.department || '',
              emailVerified: credential.user.emailVerified,
              createdAt: serverTimestamp(),
            });
            try { if (typeof window !== 'undefined') window.localStorage.removeItem('pendingProfile'); } catch (e) {}
          }
        } catch (syncError) {
          // ignore profile sync errors, let login continue
        }
      }

      await logActivityEvent({
        module: 'auth',
        action: 'login',
        description: 'Signed in to the system',
        performedBy: email,
        performedByEmail: email,
      });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      return false;
    }
  };

  const signup = async (email: string, password: string): Promise<boolean> => {
    try {
      setError(null);
      const totalUsers = await getCurrentRegisteredUserCount();
      if (totalUsers >= MAX_REGISTERED_USERS) {
        setError(`Maximum user limit reached (${MAX_REGISTERED_USERS}).`);
        return false;
      }

      // Create auth user and send verification; do NOT create Firestore profile yet
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      try {
        await sendEmailVerification(credential.user);
      } catch (err) {
        await signOut(auth);
        setError(err instanceof Error ? err.message : 'Failed to send verification email');
        return false;
      }
      // Sign out so user must verify email before logging in
      await signOut(auth);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
      return false;
    }
  };

  const createUserProfile = async (profile: Omit<UserProfile, 'uid' | 'createdAt'>): Promise<boolean> => {
    try {
      setError(null);
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setError('No authenticated user');
        return false;
      }
      const uid = currentUser.uid;
      if (isAdminEmail(currentUser.email)) {
        await setDoc(doc(db, 'users', uid), {
          uid,
          email: currentUser.email,
          displayName: DEFAULT_ADMIN_PROFILE.displayName,
          employeeName: DEFAULT_ADMIN_PROFILE.employeeName,
          employeeId: DEFAULT_ADMIN_PROFILE.employeeId,
          mobile: DEFAULT_ADMIN_PROFILE.mobile,
          department: DEFAULT_ADMIN_PROFILE.department,
          emailVerified: currentUser.emailVerified,
          updatedAt: serverTimestamp(),
        }, { merge: true });
        return true;
      }

      const employeeName = profile.displayName || profile.employeeName || currentUser.displayName || '';
      await setDoc(doc(db, 'users', uid), {
        uid,
        email: currentUser.email,
        displayName: employeeName,
        employeeName,
        employeeId: profile.employeeId,
        mobile: profile.mobile,
        department: profile.department,
        emailVerified: currentUser.emailVerified,
        createdAt: serverTimestamp(),
      });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create profile');
      return false;
    }
  };

  const resendVerificationEmail = async (email: string, password: string): Promise<boolean> => {
    try {
      setError(null);
      const credential = await signInWithEmailAndPassword(auth, email, password);
      try {
        await sendEmailVerification(credential.user);
      } catch (err) {
        await signOut(auth);
        setError(err instanceof Error ? err.message : 'Failed to resend verification email');
        return false;
      }
      await signOut(auth);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resend verification failed');
      return false;
    }
  };

  const logout = async () => {
    try {
      setError(null);
      const actorEmail = user?.email || '';
      await signOut(auth);
      await logActivityEvent({
        module: 'auth',
        action: 'logout',
        description: 'Signed out of the system',
        performedBy: actorEmail || 'Unknown user',
        performedByEmail: actorEmail,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Logout failed');
    }
  };

  const resetPassword = async (email: string): Promise<boolean> => {
    try {
      setError(null);
      const actionCodeSettings = typeof window !== 'undefined'
        ? {
            url: `${window.location.origin}/`,
            handleCodeInApp: true,
          }
        : undefined;
      await sendPasswordResetEmail(auth, email, actionCodeSettings);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed');
      return false;
    }
  };

  const completePasswordReset = async (oobCode: string, newPassword: string): Promise<boolean> => {
    try {
      setError(null);
      await confirmPasswordReset(auth, oobCode, newPassword);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed');
      return false;
    }
  };

  return { user, loading, error, login, signup, logout, resetPassword, resendVerificationEmail, createUserProfile, isAdmin, completePasswordReset };
};
