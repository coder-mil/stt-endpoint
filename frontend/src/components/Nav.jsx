import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

export default function Nav() {
  const { user, logout } = useAuth();
  return (
    <nav className="nav">
      <Link to="/" className="nav-brand">
        <span className="dot" />
        <span>STT Endpoint</span>
      </Link>
      <div className="nav-links">
        <NavLink to="/" end>Home</NavLink>
        <NavLink to="/docs">API Docs</NavLink>
        {user ? (
          <>
            <NavLink to="/dashboard">Dashboard</NavLink>
            <span style={{ color: 'var(--fg-2)' }}>{user.email}</span>
            <button onClick={() => logout()} style={{ padding: '6px 12px' }}>
              Sair
            </button>
          </>
        ) : (
          <>
            <NavLink to="/login">Login</NavLink>
            <NavLink to="/register">Criar conta</NavLink>
          </>
        )}
      </div>
    </nav>
  );
}
