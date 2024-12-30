import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const App = () => {
  const [currentPage, setCurrentPage] = useState('login'); // Tracks current page
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [registerData, setRegisterData] = useState({ username: '', password: '', confirmPassword: '' });
  const [user, setUser] = useState(null); // Stores logged-in user information
  const [error, setError] = useState('');
  const [socket, setSocket] = useState(null); // WebSocket instance

  useEffect(() => {
    // Cleanup WebSocket
    return () => {
      if (socket) {
        socket.close();
      }
    };
  }, [socket]);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('/members/login/', loginData);
      if (response.status === 200) {
        setUser(response.data.username); // API username
        setError('');
        setCurrentPage('main');

        // WebSocket
        const ws = new WebSocket(`ws://localhost:8000/ws/${response.data.username}/`);
        ws.onopen = () => console.log('WebSocket connected');
        ws.onclose = () => console.log('WebSocket disconnected');
        setSocket(ws);
      }
    } catch (err) {
      setError('Login failed. Please check your username and password.');
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (registerData.password !== registerData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    try {
      const response = await axios.post('/members/register/', registerData);
      if (response.status === 201) {
        setError('');
        setCurrentPage('login'); 
      }
    } catch (err) {
      setError('Registration failed. Ensure your password meets the requirements.');
    }
  };

  const handleLogout = async () => {
    try {
      const response = await axios.post('/members/logout/');
      if (response.status === 200) {
        setUser(null);
        setCurrentPage('login');
        setError('');
        if (socket) {
          socket.close();
          setSocket(null);
        }
      }
    } catch (err) {
      setError('Logout failed.');
    }
  };

  return (
    <div className="App" style={{ backgroundColor: '#2B1B1B', color: '#fff', minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', fontFamily: 'Arial, sans-serif' }}>
      {currentPage === 'login' && (
        <div className="form-container" style={{ textAlign: 'center', backgroundColor: '#8B0000', padding: '40px', borderRadius: '10px', width: '400px', boxShadow: '0 4px 8px rgba(0,0,0,0.2)' }}>
          <h2 style={{ color: '#fff', marginBottom: '20px' }}>Login</h2>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Username"
              value={loginData.username}
              onChange={(e) => setLoginData({ ...loginData, username: e.target.value })}
              style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }}
            />
            <input
              type="password"
              placeholder="Password"
              value={loginData.password}
              onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
              style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }}
            />
            <button type="submit" style={{ width: '100%', padding: '10px', backgroundColor: '#fff', color: '#8B0000', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}>Login</button>
          </form>
          <button onClick={() => setCurrentPage('register')} style={{ marginTop: '15px', backgroundColor: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Register</button>
          {error && <p style={{ color: 'red', marginTop: '15px' }}>{error}</p>}
        </div>
      )}

      {currentPage === 'register' && (
        <div className="form-container" style={{ textAlign: 'center', backgroundColor: '#8B0000', padding: '40px', borderRadius: '10px', width: '400px', boxShadow: '0 4px 8px rgba(0,0,0,0.2)' }}>
          <h2 style={{ color: '#fff', marginBottom: '20px' }}>Register</h2>
          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '15px', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Username"
              value={registerData.username}
              onChange={(e) => setRegisterData({ ...registerData, username: e.target.value })}
              style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }}
            />
            <input
              type="password"
              placeholder="Password"
              value={registerData.password}
              onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
              style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }}
            />
            <input
              type="password"
              placeholder="Confirm Password"
              value={registerData.confirmPassword}
              onChange={(e) => setRegisterData({ ...registerData, confirmPassword: e.target.value })}
              style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }}
            />
            <button type="submit" style={{ width: '100%', padding: '10px', backgroundColor: '#fff', color: '#8B0000', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}>Register</button>
          </form>
          <button onClick={() => setCurrentPage('login')} style={{ marginTop: '15px', backgroundColor: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Back to Login</button>
          {error && <p style={{ color: 'red', marginTop: '15px' }}>{error}</p>}
        </div>
      )}

      {currentPage === 'main' && (
        <div style={{ textAlign: 'center', width: '400px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h2>Welcome, {user}!</h2>
            <button onClick={handleLogout} style={{ padding: '10px', backgroundColor: '#fff', color: '#8B0000', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}>Logout</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <button style={{ padding: '10px', backgroundColor: '#8B0000', color: '#fff', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}>Play Pong</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;