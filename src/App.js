import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

// Cookie utility functions
const setCookie = (name, value, hours) => {
  const expires = new Date();
  expires.setTime(expires.getTime() + (hours * 60 * 60 * 1000));
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
};

const getCookie = (name) => {
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for(let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
};

const deleteCookie = (name) => {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
};

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://nallavan-92et.onrender.com';

function App() {
  // State management
  const [socket, setSocket] = useState(null);
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [showLogin, setShowLogin] = useState(true);
  const [adminPassword, setAdminPassword] = useState('');
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Check for existing session on component mount
  useEffect(() => {
    const savedUser = getCookie('chatUser');
    const sessionExpiry = getCookie('chatSessionExpiry');
    
    if (savedUser && sessionExpiry) {
      const currentTime = new Date().getTime();
      const expiryTime = parseInt(sessionExpiry);
      
      if (currentTime < expiryTime) {
        // Session is still valid
        const userData = JSON.parse(savedUser);
        setUser(userData);
        setShowLogin(false);
      } else {
        // Session expired, clear cookies
        deleteCookie('chatUser');
        deleteCookie('chatSessionExpiry');
      }
    }
  }, []);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Socket connection and event handlers
  useEffect(() => {
    if (!user) return;

    const newSocket = io(BACKEND_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to server');
      setConnectionStatus('connected');
      newSocket.emit('join', { username: user.username, role: user.role });
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setConnectionStatus('disconnected');
    });

    newSocket.on('newMessage', (message) => {
      setMessages(prev => [...prev, message]);
    });

    newSocket.on('messageDeleted', ({ messageId }) => {
      setMessages(prev => prev.filter(msg => msg._id !== messageId));
    });

    newSocket.on('allMessagesCleared', () => {
      setMessages([]);
    });

    newSocket.on('onlineUsers', (users) => {
      setOnlineUsers(users);
    });

    newSocket.on('userStatusUpdate', ({ username, role, status, timestamp }) => {
      if (status === 'online') {
        setOnlineUsers(prev => [...prev, { username, role, connectedAt: timestamp }]);
      } else {
        setOnlineUsers(prev => prev.filter(u => u.username !== username));
      }
      
      // Store in localStorage for offline status display
      const statusHistory = JSON.parse(localStorage.getItem('statusHistory') || '[]');
      statusHistory.push({ username, role, status, timestamp });
      localStorage.setItem('statusHistory', JSON.stringify(statusHistory.slice(-50))); // Keep last 50 entries
    });

    newSocket.on('userTyping', ({ username, role, isTyping }) => {
      setTypingUsers(prev => {
        const filtered = prev.filter(u => u.username !== username);
        if (isTyping) {
          return [...filtered, { username, role }];
        }
        return filtered;
      });
    });

    newSocket.on('error', ({ message }) => {
      alert(`Error: ${message}`);
    });

    return () => {
      newSocket.close();
    };
  }, [user]);

  // Load messages on mount
  useEffect(() => {
    if (!user) return;
    
    fetch(`${BACKEND_URL}/api/messages`)
      .then(res => res.json())
      .then(data => setMessages(data))
      .catch(err => console.error('Error loading messages:', err));
  }, [user]);

  // Handle admin login
  const handleAdminLogin = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/verify-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword })
      });

      const result = await response.json();
      
      if (result.success) {
        const userData = { username: 'admin', role: 'admin' };
        setUser(userData);
        setShowLogin(false);
        
        // Save session to cookies (2 hours)
        const expiryTime = new Date().getTime() + (2 * 60 * 60 * 1000); // 2 hours from now
        setCookie('chatUser', JSON.stringify(userData), 2);
        setCookie('chatSessionExpiry', expiryTime.toString(), 2);
        
        // Reset password fields
        setAdminPassword('');
        setShowPasswordInput(false);
        setShowPassword(false);
      } else {
        alert('Invalid password');
      }
    } catch (error) {
      alert('Connection error');
    }
  };

  // Handle role selection
  const handleRoleSelection = (selectedRole) => {
    if (selectedRole === 'admin') {
      setShowPasswordInput(true);
    } else if (selectedRole === 'receiver') {
      const userData = { username: 'receiver', role: 'receiver' };
      setUser(userData);
      setShowLogin(false);
      
      // Save session to cookies (2 hours)
      const expiryTime = new Date().getTime() + (2 * 60 * 60 * 1000); // 2 hours from now
      setCookie('chatUser', JSON.stringify(userData), 2);
      setCookie('chatSessionExpiry', expiryTime.toString(), 2);
    }
  };

  // Handle logout
  const handleLogout = () => {
    if (socket) {
      socket.close();
    }
    setUser(null);
    setShowLogin(true);
    setMessages([]);
    setOnlineUsers([]);
    setTypingUsers([]);
    setShowPasswordInput(false);
    setShowPassword(false);
    setAdminPassword('');
    
    // Clear cookies
    deleteCookie('chatUser');
    deleteCookie('chatSessionExpiry');
  };

  // Send message
  const sendMessage = () => {
    if (!newMessage.trim() || !socket) return;

    socket.emit('sendMessage', { content: newMessage.trim() });
    setNewMessage('');
    handleTypingStop();
  };

  // Handle typing
  const handleTypingStart = () => {
    if (!isTyping && socket) {
      setIsTyping(true);
      socket.emit('typing', { isTyping: true });
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout
    typingTimeoutRef.current = setTimeout(() => {
      handleTypingStop();
    }, 2000);
  };

  const handleTypingStop = () => {
    if (isTyping && socket) {
      setIsTyping(false);
      socket.emit('typing', { isTyping: false });
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  };

  // Delete message (admin only)
  const deleteMessage = (messageId) => {
    if (user.role === 'admin' && socket) {
      socket.emit('deleteMessage', messageId);
    }
  };

  // Clear all messages (admin only)
  const clearAllMessages = () => {
    if (user.role === 'admin' && socket && window.confirm('Are you sure you want to delete all messages?')) {
      socket.emit('clearAllMessages');
    }
  };

  // Format timestamp
  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  // Login screen
  if (showLogin) {
    return (
      <div className="login-container">
        <div className="login-box">
          <h1 className="login-title">Join Chat</h1>
          
          <div className="login-form">
            {!showPasswordInput ? (
              <div className="button-group">
                <button
                  onClick={() => handleRoleSelection('receiver')}
                  className="btn btn-primary"
                >
                  Join as Receiver
                </button>
                <button
                  onClick={() => handleRoleSelection('admin')}
                  className="btn btn-admin"
                >
                  Join as Admin
                </button>
              </div>
            ) : (
              <div className="button-group">
                <div className="password-input-container">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter admin password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="login-input password-input"
                    onKeyPress={(e) => e.key === 'Enter' && handleAdminLogin()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="password-toggle"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? "👁️" : "👁️‍🗨️"}
                  </button>
                </div>
                <button
                  onClick={handleAdminLogin}
                  disabled={!adminPassword.trim()}
                  className="btn btn-admin"
                >
                  Login as Admin
                </button>
                <button
                  onClick={() => {
                    setShowPasswordInput(false);
                    setAdminPassword('');
                    setShowPassword(false);
                  }}
                  className="btn btn-secondary"
                >
                  Back
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Main chat interface
  return (
    <div className="chat-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>{user.role === 'admin' ? 'Admin Panel' : 'Chat Room'}</h2>
          <p className="user-info">
            {user.username} ({user.role})
          </p>
          <div className={`connection-status ${connectionStatus}`}>
            {connectionStatus === 'connected' ? '● Connected' : '● Disconnected'}
          </div>
        </div>

        {/* Online Users */}
        <div className="online-users">
          <h3>Online Users ({onlineUsers.length})</h3>
          <div className="user-list">
            {onlineUsers.map((user, index) => (
              <div key={index} className="user-item">
                <div className="status-dot online"></div>
                <span className={user.role === 'admin' ? 'admin-user' : 'normal-user'}>
                  {user.username} ({user.role})
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Admin Controls */}
        {user.role === 'admin' && (
          <div className="admin-controls">
            <button
              onClick={clearAllMessages}
              className="btn btn-danger btn-full"
            >
              Clear All Messages
            </button>
          </div>
        )}
      </div>

      {/* Main Chat Area */}
      <div className="chat-main">
        {/* Messages */}
        <div className="messages-container">
          {messages.map((message) => (
            <div
              key={message._id}
              className={`message ${message.username === user.username ? 'sent' : 'received'}`}
            >
              <div className={`message-bubble ${
                message.username === user.username
                  ? 'sent-bubble'
                  : message.role === 'admin'
                  ? 'admin-bubble'
                  : 'received-bubble'
              }`}>
                <div className="message-header">
                  {message.username} ({message.role})
                </div>
                <div className="message-content">{message.content}</div>
                <div className="message-time">
                  {formatTime(message.timestamp)}
                </div>
                
                {/* Delete button for admin */}
                {user.role === 'admin' && (
                  <button
                    onClick={() => deleteMessage(message._id)}
                    className="delete-btn"
                    title="Delete message"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}
          
          {/* Typing indicators */}
          {typingUsers.length > 0 && (
            <div className="typing-indicator">
              {typingUsers.map(user => user.username).join(', ')} 
              {typingUsers.length === 1 ? ' is' : ' are'} typing...
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input */}
        <div className="message-input-container">
          <div className="message-input-wrapper">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => {
                setNewMessage(e.target.value);
                handleTypingStart();
              }}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Type your message..."
              className="message-input"
            />
            <button
              onClick={sendMessage}
              disabled={!newMessage.trim()}
              className="send-btn"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
