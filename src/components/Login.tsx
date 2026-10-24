import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import './Login.css';
import logo from '../assets/companyLogo.png';

interface LoginProps {
  onLoginSuccess: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [mobile, setMobile] = useState('');
  const [company, setCompany] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [signupMessage, setSignupMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { error, login, signup, resetPassword, resendVerificationEmail } = useAuth();

  const validatePasswords = (): boolean => {
    setPasswordError('');

    if (isSignup) {
      if (password.length < 6) {
        setPasswordError('Password must be at least 6 characters long');
        return false;
      }
      if (password !== confirmPassword) {
        setPasswordError('Passwords do not match');
        return false;
      }
    }
    return true;
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    if (isSignup && confirmPassword && value !== confirmPassword) {
      setPasswordError('Passwords do not match');
    } else {
      setPasswordError('');
    }
  };

  const handleConfirmPasswordChange = (value: string) => {
    setConfirmPassword(value);
    if (isSignup && password && password !== value) {
      setPasswordError('Passwords do not match');
    } else {
      setPasswordError('');
    }
  };

  const validateSignupEmail = (): boolean => {
    if (isSignup && !email.trim()) {
      setPasswordError('Please enter your email address');
      return false;
    }
    return true;
  };

  const validateResetEmail = (): boolean => {
    if (!email.trim()) {
      setPasswordError('Please enter your email address');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isForgotPassword) {
      if (!validateResetEmail()) {
        return;
      }
      const success = await resetPassword(email.trim());
      if (success) {
        setResetMessage('Password reset link sent. Please check your inbox and spam folder, then use the link to create a new password.');
        setPasswordError('');
      }
      return;
    }

    if (!validatePasswords() || !validateSignupEmail()) {
      return;
    }

    // If signing up, first store the profile temporarily and request verification
    const success = isSignup
      ? ((): Promise<boolean> => {
          // store pending profile so it can be used after verification
          const fullName = `${firstName} ${lastName}`.trim();
        const pending = JSON.stringify({ displayName: fullName, employeeId: '', mobile, department: company });
          try {
            if (typeof window !== 'undefined') window.localStorage.setItem('pendingProfile', pending);
          } catch (e) {
            // ignore
          }
          return signup(email, password);
        })()
      : await login(email, password);
    if (success) {
      if (isSignup) {
        setSignupMessage('Verification email sent. Please check your inbox and click the verification link. After verification, log in to complete signup.');
        setIsSignup(false);
        setPassword('');
        setConfirmPassword('');
        setFirstName('');
        setLastName('');
        setMobile('');
        setCompany('');
      } else {
        onLoginSuccess();
      }
    }
  };

  const handleSignupToggle = () => {
    setIsSignup(!isSignup);
    setIsForgotPassword(false);
    setConfirmPassword('');
    setPasswordError('');
    setResetMessage('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const handleForgotPasswordToggle = () => {
    const nextForgotPasswordState = !isForgotPassword;
    setIsForgotPassword(nextForgotPasswordState);
    setIsSignup(false);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setResetMessage('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="brand-panel">
          <img src={logo} alt="Company logo" className="login-logo" />
          <h1>OneDesk</h1>
          <p>Secure access for incident management.</p>
        </div>

        <div className={`login-box ${isSignup ? 'signup-mode' : ''}`}>
          <h2>{isSignup ? 'Create Account' : 'Welcome Back'}</h2>
          <form onSubmit={handleSubmit}>
                {isForgotPassword && (
                  <div className="form-group full-width">
                    <label htmlFor="resetEmail">Email address:</label>
                    <input
                      id="resetEmail"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email address"
                      required
                    />
                  </div>
                )}

                {isSignup && !isForgotPassword && (
                  <>
                    <div className="form-group full-width">
                      <label htmlFor="email">Email address:</label>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>

                    <div className="signup-grid">
                      <div className="form-group">
                        <label htmlFor="firstName">First Name:</label>
                        <input
                          id="firstName"
                          type="text"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="lastName">Last Name:</label>
                        <input
                          id="lastName"
                          type="text"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="mobile">Mobile Number:</label>
                        <input
                          id="mobile"
                          type="tel"
                          value={mobile}
                          onChange={(e) => setMobile(e.target.value)}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="company">Company:</label>
                        <input
                          id="company"
                          type="text"
                          value={company}
                          onChange={(e) => setCompany(e.target.value)}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="password">Password:</label>
                        <div className="password-input-group">
                          <input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => handlePasswordChange(e.target.value)}
                            required
                          />
                          <button
                            type="button"
                            className="password-toggle"
                            onClick={() => setShowPassword((prev) => !prev)}
                            aria-label={showPassword ? 'Show password' : 'Hide password'}
                          >
                            {showPassword ? (
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M12 5c5.2 0 9.5 3.1 11 7-1.5 3.9-5.8 7-11 7S2.5 15.9 1 12c1.5-3.9 5.8-7 11-7Zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" />
                              </svg>
                            ) : (
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M2.7 2.7a1 1 0 0 1 1.4 0l17.2 17.2a1 1 0 0 1-1.4 1.4L15.9 19A13.4 13.4 0 0 1 12 20c-5.2 0-9.5-3.1-11-7a12.8 12.8 0 0 1 3.2-4.8L2.7 2.7ZM12 7c1.3 0 2.5.4 3.5 1.1l-1.5 1.5A3 3 0 0 0 9 12a3 3 0 0 0 .4 1.5l-1.6 1.6A5 5 0 0 1 7 12a5 5 0 0 1 5-5Zm6.2 3.8a11.5 11.5 0 0 1 2.7 4.2c-1.5 3.9-5.8 7-11 7a11.4 11.4 0 0 1-4.2-1l-1.6 1.6A13.4 13.4 0 0 0 12 20c5.2 0 9.5-3.1 11-7a12.5 12.5 0 0 0-2.5-3.8l-1.3 1.3Z" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="form-group">
                        <label htmlFor="confirmPassword">Re-type Password:</label>
                        <div className="password-input-group">
                          <input
                            id="confirmPassword"
                            type={showConfirmPassword ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(e) => handleConfirmPasswordChange(e.target.value)}
                            required
                          />
                          <button
                            type="button"
                            className="password-toggle"
                            onClick={() => setShowConfirmPassword((prev) => !prev)}
                            aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                          >
                            {showConfirmPassword ? (
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M12 5c5.2 0 9.5 3.1 11 7-1.5 3.9-5.8 7-11 7S2.5 15.9 1 12c1.5-3.9 5.8-7 11-7Zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" />
                              </svg>
                            ) : (
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M2.7 2.7a1 1 0 0 1 1.4 0l17.2 17.2a1 1 0 0 1-1.4 1.4L15.9 19A13.4 13.4 0 0 1 12 20c-5.2 0-9.5-3.1-11-7a12.8 12.8 0 0 1 3.2-4.8L2.7 2.7ZM12 7c1.3 0 2.5.4 3.5 1.1l-1.5 1.5A3 3 0 0 0 9 12a3 3 0 0 0 .4 1.5l-1.6 1.6A5 5 0 0 1 7 12a5 5 0 0 1 5-5Zm6.2 3.8a11.5 11.5 0 0 1 2.7 4.2c-1.5 3.9-5.8 7-11 7a11.4 11.4 0 0 1-4.2-1l-1.6 1.6A13.4 13.4 0 0 0 12 20c5.2 0 9.5-3.1 11-7a12.5 12.5 0 0 0-2.5-3.8l-1.3 1.3Z" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {!isSignup && !isForgotPassword && (
                  <>
                    <div className="form-group full-width">
                      <label htmlFor="email">Email address:</label>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group full-width">
                      <label htmlFor="password">Password:</label>
                      <div className="password-input-group">
                        <input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => handlePasswordChange(e.target.value)}
                          required
                        />
                        <button
                          type="button"
                          className="password-toggle"
                          onClick={() => setShowPassword((prev) => !prev)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? (
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M12 5c5.2 0 9.5 3.1 11 7-1.5 3.9-5.8 7-11 7S2.5 15.9 1 12c1.5-3.9 5.8-7 11-7Zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M2.7 2.7a1 1 0 0 1 1.4 0l17.2 17.2a1 1 0 0 1-1.4 1.4L15.9 19A13.4 13.4 0 0 1 12 20c-5.2 0-9.5-3.1-11-7a12.8 12.8 0 0 1 3.2-4.8L2.7 2.7ZM12 7c1.3 0 2.5.4 3.5 1.1l-1.5 1.5A3 3 0 0 0 9 12a3 3 0 0 0 .4 1.5l-1.6 1.6A5 5 0 0 1 7 12a5 5 0 0 1 5-5Zm6.2 3.8a11.5 11.5 0 0 1 2.7 4.2c-1.5 3.9-5.8 7-11 7a11.4 11.4 0 0 1-4.2-1l-1.6 1.6A13.4 13.4 0 0 0 12 20c5.2 0 9.5-3.1 11-7a12.5 12.5 0 0 0-2.5-3.8l-1.3 1.3Z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  </>
                )}

            {error && <div className="error-message">{error}</div>}
            {error && typeof error === 'string' && error.toLowerCase().includes('verify') && (
              <div className="resend-section">
                <p>Didn't receive the verification email?</p>
                <button
                  type="button"
                  onClick={async () => {
                    if (!email || !password) {
                      setPasswordError('Enter your email and password to resend verification');
                      return;
                    }
                    const ok = await resendVerificationEmail(email, password);
                    if (ok) {
                      setSignupMessage('Verification email resent. Please check your inbox.');
                    }
                  }}
                >
                  Resend verification email
                </button>
              </div>
            )}
            {passwordError && <div className="error-message">{passwordError}</div>}
            {resetMessage && <div className="success-message">{resetMessage}</div>}
            {signupMessage && <div className="success-message">{signupMessage}</div>}
            <button type="submit">
              {isForgotPassword ? 'Send Reset Link' : isSignup ? 'Signup' : 'Login'}
            </button>
            <p className="toggle-signup">
              {isForgotPassword ? (
                <>
                  Remembered your password?{' '}
                  <button type="button" onClick={handleForgotPasswordToggle} className="link-button">
                    Login
                  </button>
                </>
              ) : (
                <>
                  {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
                  <button type="button" onClick={handleSignupToggle} className="link-button">
                    {isSignup ? 'Login' : 'Sign Up'}
                  </button>
                </>
              )}
            </p>
            {!isForgotPassword && (
              <p className="toggle-signup">
                <button type="button" onClick={handleForgotPasswordToggle} className="link-button">
                  Forgot Password?
                </button>
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};
