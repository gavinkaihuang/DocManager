import React, { useState } from 'react';
import api from './api';
import { useNavigate } from 'react-router-dom';

const Login: React.FC = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const formData = new FormData();
            formData.append('username', username);
            formData.append('password', password);

            const response = await api.post('/token', formData);
            localStorage.setItem('token', response.data.access_token);
            navigate('/dashboard');
        } catch (err: any) {
            console.error("Login error:", err);
            const msg = err.response?.data?.detail || err.message || 'Invalid credentials or connection error';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const [showSettings, setShowSettings] = useState(false);
    const [backendUrl, setBackendUrl] = useState(localStorage.getItem('backend_url') || 'http://127.0.0.1:8000');

    const handleSaveSettings = () => {
        const cleanUrl = backendUrl.replace(/\/$/, '');
        localStorage.setItem('backend_url', cleanUrl);
        // Force reload of api base url configuration if possible, or just expect reload
        window.location.reload();
    };

    return (
        <div className="login-container">
            <div className="login-box">
                <h1>File Manager Login</h1>
                {error && <p className="error">{error}</p>}

                {!showSettings ? (
                    <>
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>Username</label>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    required
                                    disabled={loading}
                                />
                            </div>
                            <div className="form-group">
                                <label>Password</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    disabled={loading}
                                />
                            </div>
                            <button type="submit" className="btn-primary" style={{ marginBottom: '1rem', width: '100%' }} disabled={loading}>
                                {loading ? 'Logging in...' : 'Login'}
                            </button>
                        </form>
                        <button
                            className="btn-secondary"
                            onClick={() => setShowSettings(true)}
                            style={{ background: 'none', border: 'none', color: '#6366f1', textDecoration: 'underline', width: '100%', cursor: 'pointer', textAlign: 'center' }}
                        >
                            Configure Connection
                        </button>
                    </>
                ) : (
                    <div>
                        <h3>Connection Settings</h3>
                        <div className="form-group">
                            <label>Backend URL</label>
                            <input
                                type="text"
                                value={backendUrl}
                                onChange={(e) => setBackendUrl(e.target.value)}
                                placeholder="http://127.0.0.1:8000"
                            />
                        </div>
                        <button className="btn-primary" onClick={handleSaveSettings} style={{ marginBottom: '0.5rem', width: '100%' }}>SaveAndReload</button>
                        <button
                            className="btn-secondary"
                            onClick={() => setShowSettings(false)}
                            style={{ background: '#9ca3af', border: 'none', padding: '0.75rem', borderRadius: '6px', color: 'white', width: '100%', cursor: 'pointer' }}
                        >
                            Cancel
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Login;
