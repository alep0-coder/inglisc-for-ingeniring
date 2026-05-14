import React, { useState } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  updateProfile
} from 'firebase/auth';
import { auth } from '../firebase';

interface AuthOverlayProps {
  onClose: () => void;
  onSuccess: (userId: string) => void;
}

export default function AuthOverlay({ onClose, onSuccess }: AuthOverlayProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!auth) {
      setError('Firebase non è configurato correttamente.');
      setLoading(false);
      return;
    }

    try {
      if (isLogin) {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        onSuccess(userCredential.user.uid);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        if (name) {
          await updateProfile(userCredential.user, { displayName: name });
        }
        onSuccess(userCredential.user.uid);
      }
      onClose();
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/invalid-credential') {
        setError('Email o password errati.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('Questa email è già in uso.');
      } else if (err.code === 'auth/weak-password') {
        setError('La password deve avere almeno 6 caratteri.');
      } else {
        setError(err.message || 'Si è verificato un errore durante l\'autenticazione.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-overlay">
      <div className="auth-card">
        <button className="close-btn" onClick={onClose}>×</button>
        
        <div className="auth-header">
          <span className="auth-icon">{isLogin ? '🔑' : '📝'}</span>
          <h2>{isLogin ? 'Bentornato!' : 'Crea un account'}</h2>
          <p>{isLogin ? 'Accedi per sincronizzare i progressi' : 'Unisciti a noi per salvare i progressi nel cloud'}</p>
        </div>

        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <div className="form-group">
              <label>Nome</label>
              <input 
                type="text" 
                placeholder="Il tuo nome" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                required={!isLogin}
              />
            </div>
          )}
          
          <div className="form-group">
            <label>Email</label>
            <input 
              type="email" 
              placeholder="email@example.com" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input 
              type="password" 
              placeholder="••••••••" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required 
            />
          </div>

          {error && <p className="error-msg">{error}</p>}

          <button type="submit" className="cta-btn active-green" disabled={loading}>
            {loading ? 'Elaborazione…' : (isLogin ? 'Accedi' : 'Registrati')}
          </button>
        </form>

        <div className="auth-footer">
          <button className="text-btn" onClick={() => setIsLogin(!isLogin)}>
            {isLogin ? "Non hai un account? Registrati" : "Hai già un account? Accedi"}
          </button>
        </div>
      </div>
    </div>
  );
}
