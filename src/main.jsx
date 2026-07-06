import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { supabaseMisconfigured } from './supabaseClient.js'
import './index.css'

if (supabaseMisconfigured) {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <div className="auth-overlay">
      <div className="auth-card" style={{ gap: '14px' }}>
        <div className="auth-logo">⚙️</div>
        <h1 className="auth-title">Setup required</h1>
        <p className="auth-sub" style={{ textAlign: 'center' }}>
          Supabase credentials are missing.<br />
          Create a <code style={{ background: 'rgba(200,155,110,0.15)', padding: '1px 6px', borderRadius: '6px' }}>.env</code> file in the project root:
        </p>
        <pre style={{
          background: 'rgba(200,155,110,0.10)', border: '1px solid rgba(200,155,110,0.25)',
          borderRadius: '12px', padding: '14px 18px', fontSize: '12px',
          fontFamily: 'JetBrains Mono, monospace', width: '100%', whiteSpace: 'pre-wrap',
          color: 'var(--text)'
        }}>
{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}
        </pre>
        <p className="auth-sub">
          Find these in <strong>Supabase → Project → Settings → API</strong>,<br />
          then restart the dev server.
        </p>
      </div>
    </div>
  )
} else {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <AuthProvider>
        <App />
      </AuthProvider>
    </React.StrictMode>,
  )
}
