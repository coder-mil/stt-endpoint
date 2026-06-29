import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="container">
        <p className="muted">Carregando…</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
