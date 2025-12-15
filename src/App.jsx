import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import io from 'socket.io-client';

// ============================================================================
// SYNCSTREAM - Real-Time Synchronized Media Streaming
// ============================================================================

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

// YouTube IFrame API Loader
const loadYouTubeAPI = () => {
  return new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve(window.YT);
      return;
    }
    if (!document.getElementById('youtube-api')) {
      const tag = document.createElement('script');
      tag.id = 'youtube-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
    const checkYT = setInterval(() => {
      if (window.YT && window.YT.Player) {
        clearInterval(checkYT);
        resolve(window.YT);
      }
    }, 100);
  });
};

// Utility Functions
const throttle = (fn, limit) => {
  let inThrottle;
  return (...args) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    const handler = throttle(check, 250);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
};

const extractYouTubeId = (url) => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
};

const extractSpotifyData = (url) => {
  const m = url.match(/spotify\.com\/(track|playlist|album)\/([a-zA-Z0-9]+)/);
  return m ? { type: m[1], id: m[2] } : null;
};

// Memoized Components
const AvatarButton = memo(({ avatar, selected, onClick }) => (
  <button className={`avatar-btn ${selected ? 'selected' : ''}`} onClick={onClick}>{avatar}</button>
));

const ParticipantItem = memo(({ participant }) => (
  <div className="participant-item">
    <span className="p-avatar">{participant.avatar}</span>
    <span className="p-name">{participant.name}</span>
    {participant.isHost && <span className="p-host">👑</span>}
  </div>
));

const ChatMessage = memo(({ message }) => (
  <div className={`message ${message.type}`}>
    {message.type === 'system' ? (
      <span className="system-text">{message.text}</span>
    ) : (
      <>
        <span className="msg-avatar">{message.userAvatar}</span>
        <div className="msg-content">
          <span className="msg-author">{message.userName}</span>
          <span className="msg-text">{message.text}</span>
        </div>
      </>
    )}
  </div>
));

const FeatureCard = memo(({ icon, title, description }) => (
  <div className="feature-card">
    <div className="feature-icon">{icon}</div>
    <h3>{title}</h3>
    <p>{description}</p>
  </div>
));

// ============================================================================
// YouTube Player Component with Sync
// ============================================================================
const YouTubePlayer = memo(({ videoId, socket, isHost, roomId }) => {
  const playerRef = useRef(null);
  const containerRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const isSyncing = useRef(false);

  useEffect(() => {
    const initPlayer = async () => {
      const YT = await loadYouTubeAPI();
      
      if (containerRef.current && !playerRef.current) {
        playerRef.current = new YT.Player(containerRef.current, {
          videoId: videoId,
          playerVars: {
            autoplay: 0,
            controls: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            enablejsapi: 1,
            origin: window.location.origin
          },
          events: {
            onReady: (event) => {
              setIsReady(true);
              setDuration(event.target.getDuration());
            },
            onStateChange: (event) => {
              if (isSyncing.current) return;
              
              const state = event.data;
              const time = event.target.getCurrentTime();
              
              if (state === window.YT.PlayerState.PLAYING) {
                if (isHost && socket) {
                  socket.emit('sync:play', { roomId, time });
                }
              } else if (state === window.YT.PlayerState.PAUSED) {
                if (isHost && socket) {
                  socket.emit('sync:pause', { roomId, time });
                }
              }
            }
          }
        });
      }
    };

    initPlayer();

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [videoId, isHost, socket, roomId]);

  // Time update interval
  useEffect(() => {
    const interval = setInterval(() => {
      if (playerRef.current && isReady && playerRef.current.getCurrentTime) {
        setCurrentTime(playerRef.current.getCurrentTime());
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isReady]);

  // Socket listeners for sync (non-host)
  useEffect(() => {
    if (!socket || isHost) return;

    const handlePlay = ({ time }) => {
      if (playerRef.current) {
        isSyncing.current = true;
        playerRef.current.seekTo(time, true);
        playerRef.current.playVideo();
        setTimeout(() => { isSyncing.current = false; }, 500);
      }
    };

    const handlePause = ({ time }) => {
      if (playerRef.current) {
        isSyncing.current = true;
        playerRef.current.seekTo(time, true);
        playerRef.current.pauseVideo();
        setTimeout(() => { isSyncing.current = false; }, 500);
      }
    };

    const handleSeek = ({ time }) => {
      if (playerRef.current) {
        isSyncing.current = true;
        playerRef.current.seekTo(time, true);
        setTimeout(() => { isSyncing.current = false; }, 500);
      }
    };

    const handleSyncState = ({ time, playing }) => {
      if (playerRef.current) {
        isSyncing.current = true;
        playerRef.current.seekTo(time, true);
        if (playing) {
          playerRef.current.playVideo();
        } else {
          playerRef.current.pauseVideo();
        }
        setTimeout(() => { isSyncing.current = false; }, 500);
      }
    };

    socket.on('sync:play', handlePlay);
    socket.on('sync:pause', handlePause);
    socket.on('sync:seek', handleSeek);
    socket.on('sync:state', handleSyncState);

    // Request current state when joining
    socket.emit('sync:request', { roomId });

    return () => {
      socket.off('sync:play', handlePlay);
      socket.off('sync:pause', handlePause);
      socket.off('sync:seek', handleSeek);
      socket.off('sync:state', handleSyncState);
    };
  }, [socket, isHost, roomId]);

  // Host responds to sync requests
  useEffect(() => {
    if (!socket || !isHost) return;

    const handleSyncRequest = () => {
      if (playerRef.current && playerRef.current.getCurrentTime) {
        const time = playerRef.current.getCurrentTime();
        const state = playerRef.current.getPlayerState();
        const playing = state === window.YT?.PlayerState?.PLAYING;
        socket.emit('sync:state', { roomId, time, playing });
      }
    };

    socket.on('sync:request', handleSyncRequest);
    return () => socket.off('sync:request', handleSyncRequest);
  }, [socket, isHost, roomId]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const time = percent * duration;
    
    if (playerRef.current) {
      playerRef.current.seekTo(time, true);
      if (isHost && socket) {
        socket.emit('sync:seek', { roomId, time });
      }
    }
  };

  return (
    <div className="youtube-player-wrapper">
      <div className="youtube-container">
        <div ref={containerRef} id="youtube-player"></div>
      </div>
      <div className="custom-controls">
        <span className="time-display">{formatTime(currentTime)}</span>
        <div className="progress-bar" onClick={handleSeek}>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }} />
          </div>
        </div>
        <span className="time-display">{formatTime(duration)}</span>
        {!isHost && <span className="sync-badge">🔄 Senkronize</span>}
      </div>
    </div>
  );
});

// Spotify Player
const SpotifyPlayer = memo(({ spotifyData }) => {
  if (!spotifyData) return null;
  return (
    <div className="spotify-player">
      <iframe
        src={`https://open.spotify.com/embed/${spotifyData.type}/${spotifyData.id}?utm_source=generator&theme=0`}
        width="100%"
        height="352"
        frameBorder="0"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        title="Spotify"
      />
    </div>
  );
});

// URL Video Player
const URLVideoPlayer = memo(({ url, socket, isHost, roomId }) => {
  const videoRef = useRef(null);
  const isSyncing = useRef(false);

  useEffect(() => {
    if (!socket || isHost) return;

    const handlePlay = ({ time }) => {
      if (videoRef.current) {
        isSyncing.current = true;
        videoRef.current.currentTime = time;
        videoRef.current.play();
        setTimeout(() => { isSyncing.current = false; }, 500);
      }
    };

    const handlePause = ({ time }) => {
      if (videoRef.current) {
        isSyncing.current = true;
        videoRef.current.currentTime = time;
        videoRef.current.pause();
        setTimeout(() => { isSyncing.current = false; }, 500);
      }
    };

    const handleSeek = ({ time }) => {
      if (videoRef.current) {
        isSyncing.current = true;
        videoRef.current.currentTime = time;
        setTimeout(() => { isSyncing.current = false; }, 500);
      }
    };

    socket.on('sync:play', handlePlay);
    socket.on('sync:pause', handlePause);
    socket.on('sync:seek', handleSeek);

    return () => {
      socket.off('sync:play', handlePlay);
      socket.off('sync:pause', handlePause);
      socket.off('sync:seek', handleSeek);
    };
  }, [socket, isHost]);

  const handlePlay = () => {
    if (isSyncing.current) return;
    if (isHost && socket && videoRef.current) {
      socket.emit('sync:play', { roomId, time: videoRef.current.currentTime });
    }
  };

  const handlePause = () => {
    if (isSyncing.current) return;
    if (isHost && socket && videoRef.current) {
      socket.emit('sync:pause', { roomId, time: videoRef.current.currentTime });
    }
  };

  return (
    <div className="url-player">
      <video
        ref={videoRef}
        src={url}
        controls
        playsInline
        onPlay={handlePlay}
        onPause={handlePause}
      />
      {!isHost && <div className="sync-indicator">🔄 Host ile senkronize</div>}
    </div>
  );
});

// ============================================================================
// Main App
// ============================================================================
export default function SyncStreamApp() {
  const [currentView, setCurrentView] = useState('landing');
  const [user, setUser] = useState(null);
  const [room, setRoom] = useState(null);
  const [socket, setSocket] = useState(null);
  const [mediaType, setMediaType] = useState('youtube');
  const [mediaUrl, setMediaUrl] = useState('');
  const [messages, setMessages] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile();

  // Socket Connection
  useEffect(() => {
    if (!room || !user) return;

    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      query: { roomId: room.id, odaId: user.id }
    });

    newSocket.on('connect', () => {
      setConnectionStatus('connected');
      newSocket.emit('room:join', {
        roomId: room.id,
        user: { id: user.id, name: user.name, avatar: user.avatar, isHost }
      });
    });

    newSocket.on('disconnect', () => setConnectionStatus('disconnected'));

    newSocket.on('room:users', (users) => setParticipants(users));

    newSocket.on('room:user_joined', (userData) => {
      setParticipants(prev => [...prev.filter(p => p.id !== userData.id), userData]);
      setMessages(prev => [...prev, { id: `sys_${Date.now()}`, type: 'system', text: `${userData.name} odaya katıldı`, timestamp: Date.now() }]);
    });

    newSocket.on('room:user_left', (userData) => {
      setParticipants(prev => prev.filter(p => p.id !== userData.id));
      setMessages(prev => [...prev, { id: `sys_${Date.now()}`, type: 'system', text: `${userData.name} odadan ayrıldı`, timestamp: Date.now() }]);
    });

    newSocket.on('chat:message', (message) => setMessages(prev => [...prev.slice(-99), message]));

    newSocket.on('media:change', ({ mediaType: type, mediaUrl: url }) => {
      setMediaType(type);
      setMediaUrl(url);
    });

    setSocket(newSocket);

    return () => {
      newSocket.emit('room:leave', { roomId: room.id, user });
      newSocket.disconnect();
    };
  }, [room, user, isHost]);

  // Landing Page
  const LandingPage = () => {
    const [name, setName] = useState('');
    const [avatar, setAvatar] = useState('🎬');
    const avatars = ['🎬', '🎵', '🎮', '🎨', '🚀', '⚡', '🌟', '🔥', '💎', '🎭'];
    const features = [
      { icon: '🎬', title: 'YouTube', description: 'Senkronize video' },
      { icon: '🌐', title: 'URL Video', description: 'Özel video paylaşımı' },
      { icon: '🎵', title: 'Spotify', description: 'Birlikte müzik' },
      { icon: '💬', title: 'Live Chat', description: 'Gerçek zamanlı sohbet' }
    ];

    const handleStart = () => {
      if (name.trim()) {
        setUser({ id: `user_${Date.now()}`, name: name.trim(), avatar });
        setCurrentView('lobby');
      }
    };

    return (
      <div className="landing-page">
        <div className="landing-content">
          <div className="logo-section">
            <div className="logo-icon">
              <svg viewBox="0 0 100 100" className="logo-svg">
                <defs><linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#FF6B6B" /><stop offset="50%" stopColor="#A855F7" /><stop offset="100%" stopColor="#06B6D4" /></linearGradient></defs>
                <circle cx="50" cy="50" r="45" fill="url(#logoGrad)" opacity="0.2" />
                <circle cx="50" cy="50" r="35" fill="url(#logoGrad)" opacity="0.4" />
                <circle cx="50" cy="50" r="25" fill="url(#logoGrad)" />
                <polygon points="42,35 42,65 68,50" fill="white" />
              </svg>
            </div>
            <h1 className="logo-text">SyncStream</h1>
            <p className="tagline">Watch Together. Listen Together.</p>
          </div>
          <div className="onboarding-card">
            <h2>Hoş Geldiniz</h2>
            <p>Arkadaşlarınızla senkronize izleme deneyimi için adınızı girin.</p>
            <div className="avatar-selector">
              <span className="label">Avatar Seçin</span>
              <div className="avatar-grid">{avatars.map((a) => <AvatarButton key={a} avatar={a} selected={avatar === a} onClick={() => setAvatar(a)} />)}</div>
            </div>
            <div className="input-group">
              <input type="text" placeholder="Adınızı girin..." value={name} onChange={(e) => setName(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleStart()} maxLength={20} />
            </div>
            <button className="primary-btn" onClick={handleStart} disabled={!name.trim()}>
              <span>Başla</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </button>
          </div>
          <div className="features-grid">{features.map((f) => <FeatureCard key={f.title} {...f} />)}</div>
        </div>
        <div className="landing-bg"><div className="bg-orb orb-1"></div><div className="bg-orb orb-2"></div><div className="bg-orb orb-3"></div></div>
      </div>
    );
  };

  // Lobby Page
  const LobbyPage = () => {
    const [roomCode, setRoomCode] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [isJoining, setIsJoining] = useState(false);

    const generateRoomCode = () => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    };

    const createRoom = () => {
      setIsCreating(true);
      const newRoom = { id: generateRoomCode(), name: `${user.name}'ın Odası`, host: user.id };
      setRoom(newRoom);
      setIsHost(true);
      setParticipants([{ ...user, isHost: true }]);
      setCurrentView('room');
    };

    const joinRoom = () => {
      if (roomCode.length === 6) {
        setIsJoining(true);
        setRoom({ id: roomCode.toUpperCase(), name: 'Watch Party', host: null });
        setIsHost(false);
        setCurrentView('room');
      }
    };

    return (
      <div className="lobby-page">
        <header className="lobby-header">
          <div className="logo-mini" onClick={() => setCurrentView('landing')}>
            <svg viewBox="0 0 100 100" className="logo-svg-mini"><defs><linearGradient id="logoGradMini" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#FF6B6B" /><stop offset="50%" stopColor="#A855F7" /><stop offset="100%" stopColor="#06B6D4" /></linearGradient></defs><circle cx="50" cy="50" r="25" fill="url(#logoGradMini)" /><polygon points="42,35 42,65 68,50" fill="white" /></svg>
            <span>SyncStream</span>
          </div>
          <div className="user-badge"><span className="user-avatar">{user?.avatar}</span><span className="user-name">{user?.name}</span></div>
        </header>
        <div className="lobby-content">
          <h1>İzleme Odası</h1>
          <p className="lobby-subtitle">Yeni oda oluşturun veya mevcut odaya katılın</p>
          <div className="lobby-cards">
            <div className="lobby-card">
              <div className="card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" /></svg></div>
              <h2>Oda Oluştur</h2>
              <p>Yeni bir izleme odası oluşturun</p>
              <button className="primary-btn" onClick={createRoom} disabled={isCreating}>
                {isCreating ? <span className="loading-spinner"></span> : <><span>Oda Oluştur</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg></>}
              </button>
            </div>
            <div className="divider"><span>veya</span></div>
            <div className="lobby-card">
              <div className="card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" /></svg></div>
              <h2>Odaya Katıl</h2>
              <p>6 haneli oda kodunu girin</p>
              <div className="room-code-input"><input type="text" placeholder="XXXXXX" value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase().slice(0, 6))} maxLength={6} /></div>
              <button className="secondary-btn" onClick={joinRoom} disabled={roomCode.length !== 6 || isJoining}>
                {isJoining ? <span className="loading-spinner"></span> : <span>Odaya Katıl</span>}
              </button>
            </div>
          </div>
        </div>
        <div className="lobby-bg"><div className="bg-orb orb-1"></div><div className="bg-orb orb-2"></div></div>
      </div>
    );
  };

  // Room Page
  const RoomPage = () => {
    const [newMessage, setNewMessage] = useState('');
    const [urlInput, setUrlInput] = useState('');
    const chatContainerRef = useRef(null);

    const handleLoadMedia = useCallback(() => {
      if (!urlInput.trim()) return;
      let detectedType = mediaType;
      if (urlInput.includes('youtube.com') || urlInput.includes('youtu.be')) detectedType = 'youtube';
      else if (urlInput.includes('spotify.com')) detectedType = 'spotify';
      else detectedType = 'url';
      setMediaType(detectedType);
      setMediaUrl(urlInput);
      if (socket && isHost) socket.emit('media:change', { roomId: room.id, mediaType: detectedType, mediaUrl: urlInput });
      setMessages(prev => [...prev, { id: `sys_${Date.now()}`, type: 'system', text: `${user.name} yeni medya yükledi`, timestamp: Date.now() }]);
    }, [urlInput, mediaType, socket, isHost, room, user]);

    const sendMessage = useCallback(() => {
      if (!newMessage.trim() || !socket) return;
      const message = { id: `msg_${Date.now()}`, type: 'user', userName: user.name, userAvatar: user.avatar, text: newMessage.trim(), timestamp: Date.now() };
      socket.emit('chat:message', { roomId: room.id, message });
      setMessages(prev => [...prev.slice(-99), message]);
      setNewMessage('');
    }, [newMessage, socket, user, room]);

    useEffect(() => {
      if (chatContainerRef.current) chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }, [messages]);

    const copyRoomCode = async () => {
      try { await navigator.clipboard.writeText(room.id); setMessages(prev => [...prev, { id: `sys_${Date.now()}`, type: 'system', text: 'Oda kodu kopyalandı!', timestamp: Date.now() }]); } catch (e) { console.error(e); }
    };

    const leaveRoom = () => {
      if (socket) { socket.emit('room:leave', { roomId: room.id, user }); socket.disconnect(); }
      setRoom(null); setSocket(null); setMessages([]); setParticipants([]); setMediaUrl(''); setSidebarOpen(false); setCurrentView('lobby');
    };

    const renderMediaPlayer = () => {
      if (!mediaUrl) {
        return (<div className="empty-player"><div className="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M10 9l5 3-5 3V9z" /></svg></div><p>Medya yüklemek için URL girin</p>{!isHost && <p className="hint">Host medya yükleyene kadar bekleyin</p>}</div>);
      }
      if (mediaType === 'youtube') {
        const videoId = extractYouTubeId(mediaUrl);
        if (!videoId) return <div className="error-message">Geçersiz YouTube URL</div>;
        return <YouTubePlayer videoId={videoId} socket={socket} isHost={isHost} roomId={room.id} />;
      }
      if (mediaType === 'spotify') {
        const spotifyData = extractSpotifyData(mediaUrl);
        return <SpotifyPlayer spotifyData={spotifyData} />;
      }
      if (mediaType === 'url') {
        return <URLVideoPlayer url={mediaUrl} socket={socket} isHost={isHost} roomId={room.id} />;
      }
      return null;
    };

    return (
      <div className={`room-page ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <header className="room-header">
          <div className="header-left">
            <button className="back-btn" onClick={leaveRoom}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg></button>
            <div className="room-info">
              <h1>{room?.name || 'Watch Party'}</h1>
              <div className="room-meta"><span className={`status-dot ${connectionStatus}`}></span><button className="room-code" onClick={copyRoomCode}>{room?.id}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg></button></div>
            </div>
          </div>
          <div className="header-right">
            <div className="participants-preview" onClick={() => setSidebarOpen(true)}>
              {participants.slice(0, 3).map((p, i) => (<div key={p.id} className="participant-avatar" style={{ zIndex: 3 - i }}>{p.avatar}</div>))}
              {participants.length > 3 && <div className="participant-more">+{participants.length - 3}</div>}
            </div>
            {isHost && <span className="host-badge">👑 Host</span>}
            <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>{messages.length > 0 && <span className="badge">{Math.min(messages.length, 99)}</span>}</button>
          </div>
        </header>
        <div className="room-content">
          <div className="media-section">
            {isHost && (
              <div className="media-input-bar">
                <div className="media-type-tabs">
                  <button className={`type-tab ${mediaType === 'youtube' ? 'active' : ''}`} onClick={() => setMediaType('youtube')}><svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg><span>YouTube</span></button>
                  <button className={`type-tab ${mediaType === 'url' ? 'active' : ''}`} onClick={() => setMediaType('url')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg><span>URL</span></button>
                  <button className={`type-tab ${mediaType === 'spotify' ? 'active' : ''}`} onClick={() => setMediaType('spotify')}><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02z"/></svg><span>Spotify</span></button>
                </div>
                <div className="url-input-wrapper">
                  <input type="url" placeholder={mediaType === 'youtube' ? 'YouTube URL yapıştırın...' : mediaType === 'spotify' ? 'Spotify URL yapıştırın...' : 'Video URL yapıştırın...'} value={urlInput} onChange={(e) => setUrlInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleLoadMedia()} />
                  <button className="load-btn" onClick={handleLoadMedia}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg></button>
                </div>
              </div>
            )}
            <div className="player-container">{renderMediaPlayer()}</div>
          </div>
          {isMobile && sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
          <aside className={`room-sidebar ${sidebarOpen ? 'open' : ''}`}>
            {isMobile && <button className="sidebar-close" onClick={() => setSidebarOpen(false)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg></button>}
            <div className="sidebar-section participants-section">
              <h3><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>Katılımcılar ({participants.length})</h3>
              <div className="participants-list">{participants.map((p) => <ParticipantItem key={p.id} participant={p} />)}</div>
            </div>
            <div className="sidebar-section chat-section">
              <h3><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>Sohbet</h3>
              <div className="chat-messages" ref={chatContainerRef}>{messages.length === 0 ? <div className="chat-empty">Henüz mesaj yok</div> : messages.map((m) => <ChatMessage key={m.id} message={m} />)}</div>
              <div className="chat-input">
                <input type="text" placeholder="Mesaj yazın..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && sendMessage()} maxLength={500} />
                <button onClick={sendMessage}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg></button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    );
  };

  return (
    <div className="syncstream-app">
      <style>{`
        :root{--bg-primary:#0a0a0f;--bg-secondary:#12121a;--bg-tertiary:#1a1a25;--bg-glass:rgba(26,26,37,0.6);--text-primary:#fff;--text-secondary:#a0a0b0;--text-muted:#606070;--accent-primary:#A855F7;--accent-secondary:#06B6D4;--accent-tertiary:#FF6B6B;--accent-gradient:linear-gradient(135deg,#FF6B6B 0%,#A855F7 50%,#06B6D4 100%);--border-color:rgba(255,255,255,0.08);--border-hover:rgba(255,255,255,0.15);--radius-sm:8px;--radius-md:12px;--radius-lg:16px;--radius-xl:24px;--transition-fast:0.15s ease;--transition-normal:0.25s ease;--touch-target:44px}
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        .syncstream-app{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg-primary);color:var(--text-primary);min-height:100vh;overflow-x:hidden}
        .landing-page{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;position:relative;overflow:hidden}
        .landing-content{position:relative;z-index:10;max-width:1200px;width:100%;display:flex;flex-direction:column;align-items:center;gap:32px}
        .logo-section{text-align:center;animation:fadeInUp .6s ease-out}
        @keyframes fadeInUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        .logo-icon{width:80px;height:80px;margin:0 auto 16px;animation:pulse 3s ease-in-out infinite}
        @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
        .logo-svg{width:100%;height:100%;filter:drop-shadow(0 0 20px rgba(168,85,247,0.4))}
        .logo-text{font-size:clamp(32px,8vw,48px);font-weight:800;background:var(--accent-gradient);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .tagline{font-size:clamp(14px,4vw,18px);color:var(--text-secondary);margin-top:8px}
        .onboarding-card{background:var(--bg-glass);backdrop-filter:blur(20px);border:1px solid var(--border-color);border-radius:var(--radius-xl);padding:clamp(24px,5vw,40px);width:100%;max-width:400px}
        .onboarding-card h2{font-size:24px;font-weight:700;margin-bottom:8px}
        .onboarding-card>p{color:var(--text-secondary);margin-bottom:24px;font-size:14px}
        .avatar-selector{margin-bottom:20px}
        .avatar-selector .label{display:block;font-size:13px;color:var(--text-secondary);margin-bottom:10px}
        .avatar-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
        .avatar-btn{aspect-ratio:1;font-size:24px;background:var(--bg-tertiary);border:2px solid transparent;border-radius:var(--radius-md);cursor:pointer;transition:all var(--transition-fast);min-height:var(--touch-target);display:flex;align-items:center;justify-content:center}
        .avatar-btn:hover{transform:scale(1.05)}
        .avatar-btn.selected{border-color:var(--accent-primary);background:rgba(168,85,247,0.2)}
        .input-group{margin-bottom:20px}
        .input-group input{width:100%;padding:14px 16px;font-size:16px;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:var(--radius-md);color:var(--text-primary);outline:none}
        .input-group input:focus{border-color:var(--accent-primary)}
        .input-group input::placeholder{color:var(--text-muted)}
        .primary-btn{width:100%;padding:14px 24px;font-size:16px;font-weight:600;background:var(--accent-gradient);color:#fff;border:none;border-radius:var(--radius-md);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;min-height:var(--touch-target)}
        .primary-btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 10px 40px rgba(168,85,247,0.3)}
        .primary-btn:disabled{opacity:0.5;cursor:not-allowed}
        .primary-btn svg{width:18px;height:18px}
        .features-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;width:100%;max-width:600px}
        @media(min-width:640px){.features-grid{grid-template-columns:repeat(4,1fr)}}
        .feature-card{background:var(--bg-glass);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:20px;text-align:center}
        .feature-icon{font-size:28px;margin-bottom:10px}
        .feature-card h3{font-size:14px;font-weight:700;margin-bottom:6px}
        .feature-card p{font-size:12px;color:var(--text-secondary)}
        .landing-bg,.lobby-bg{position:fixed;inset:0;z-index:1;pointer-events:none}
        .bg-orb{position:absolute;border-radius:50%;filter:blur(80px);opacity:0.3}
        .orb-1{width:400px;height:400px;background:var(--accent-tertiary);top:-20%;left:-10%;animation:float 15s ease-in-out infinite}
        .orb-2{width:350px;height:350px;background:var(--accent-primary);bottom:-15%;right:-10%;animation:float 18s ease-in-out infinite reverse}
        .orb-3{width:300px;height:300px;background:var(--accent-secondary);top:40%;left:30%;animation:float 20s ease-in-out infinite}
        @keyframes float{0%,100%{transform:translate(0,0)}33%{transform:translate(20px,-20px)}66%{transform:translate(-15px,15px)}}
        .lobby-page{min-height:100vh;display:flex;flex-direction:column;position:relative}
        .lobby-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--bg-glass);backdrop-filter:blur(20px);border-bottom:1px solid var(--border-color);position:sticky;top:0;z-index:100}
        .logo-mini{display:flex;align-items:center;gap:10px;cursor:pointer}
        .logo-svg-mini{width:32px;height:32px}
        .logo-mini span{font-size:18px;font-weight:700;background:var(--accent-gradient);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
        .user-badge{display:flex;align-items:center;gap:8px;padding:6px 12px;background:var(--bg-tertiary);border-radius:var(--radius-lg);border:1px solid var(--border-color)}
        .user-avatar{font-size:18px}
        .user-name{font-weight:600;font-size:13px}
        .lobby-content{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 16px;position:relative;z-index:10}
        .lobby-content h1{font-size:clamp(28px,7vw,40px);font-weight:800;margin-bottom:8px}
        .lobby-subtitle{color:var(--text-secondary);margin-bottom:32px}
        .lobby-cards{display:flex;flex-direction:column;gap:20px;max-width:400px;width:100%}
        @media(min-width:768px){.lobby-cards{flex-direction:row;max-width:700px}.lobby-card{flex:1}}
        .lobby-card{background:var(--bg-glass);backdrop-filter:blur(20px);border:1px solid var(--border-color);border-radius:var(--radius-xl);padding:28px 24px;text-align:center}
        .card-icon{width:56px;height:56px;background:var(--accent-gradient);border-radius:var(--radius-lg);display:flex;align-items:center;justify-content:center;margin:0 auto 16px}
        .card-icon svg{width:28px;height:28px;color:#fff}
        .lobby-card h2{font-size:20px;font-weight:700;margin-bottom:8px}
        .lobby-card>p{color:var(--text-secondary);margin-bottom:20px;font-size:14px}
        .secondary-btn{width:100%;padding:14px 24px;font-size:16px;font-weight:600;background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:var(--radius-md);cursor:pointer;min-height:var(--touch-target)}
        .secondary-btn:hover:not(:disabled){border-color:var(--accent-primary)}
        .secondary-btn:disabled{opacity:0.5;cursor:not-allowed}
        .room-code-input input{width:100%;padding:14px;font-size:24px;font-family:monospace;font-weight:700;letter-spacing:8px;text-align:center;background:var(--bg-tertiary);border:2px solid var(--border-color);border-radius:var(--radius-md);color:var(--text-primary);outline:none;margin-bottom:16px}
        .room-code-input input:focus{border-color:var(--accent-primary)}
        .divider{display:flex;align-items:center;gap:16px;color:var(--text-muted);font-size:13px}
        .divider::before,.divider::after{content:'';flex:1;height:1px;background:var(--border-color)}
        @media(min-width:768px){.divider{flex-direction:column}.divider::before,.divider::after{width:1px;height:40px}}
        .loading-spinner{width:20px;height:20px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        .room-page{height:100vh;display:flex;flex-direction:column;background:var(--bg-primary);overflow:hidden}
        .room-header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--bg-secondary);border-bottom:1px solid var(--border-color);gap:12px}
        .header-left{display:flex;align-items:center;gap:10px;min-width:0;flex:1}
        .back-btn{width:var(--touch-target);height:var(--touch-target);background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:var(--radius-md);color:var(--text-primary);cursor:pointer;display:flex;align-items:center;justify-content:center}
        .back-btn svg{width:20px;height:20px}
        .room-info{min-width:0}
        .room-info h1{font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .room-meta{display:flex;align-items:center;gap:8px;margin-top:2px}
        .status-dot{width:6px;height:6px;border-radius:50%;background:var(--text-muted)}
        .status-dot.connected{background:#10B981;box-shadow:0 0 6px #10B981}
        .room-code{display:flex;align-items:center;gap:4px;font-family:monospace;font-size:12px;color:var(--text-secondary);background:var(--bg-tertiary);padding:4px 8px;border-radius:var(--radius-sm);cursor:pointer;border:none}
        .room-code svg{width:12px;height:12px}
        .header-right{display:flex;align-items:center;gap:8px}
        .participants-preview{display:flex;cursor:pointer}
        .participant-avatar{width:30px;height:30px;background:var(--bg-tertiary);border:2px solid var(--bg-secondary);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;margin-left:-8px}
        .participant-avatar:first-child{margin-left:0}
        .participant-more{width:30px;height:30px;background:var(--accent-primary);border:2px solid var(--bg-secondary);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;margin-left:-8px}
        .host-badge{font-size:12px;background:rgba(168,85,247,0.2);color:var(--accent-primary);padding:4px 8px;border-radius:var(--radius-sm);font-weight:600;display:none}
        @media(min-width:640px){.host-badge{display:block}}
        .sidebar-toggle{width:var(--touch-target);height:var(--touch-target);background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:var(--radius-md);color:var(--text-primary);cursor:pointer;display:flex;align-items:center;justify-content:center;position:relative}
        @media(min-width:1024px){.sidebar-toggle{display:none}}
        .sidebar-toggle svg{width:20px;height:20px}
        .sidebar-toggle .badge{position:absolute;top:-4px;right:-4px;width:18px;height:18px;background:var(--accent-primary);border-radius:50%;font-size:10px;display:flex;align-items:center;justify-content:center}
        .room-content{flex:1;display:flex;overflow:hidden}
        .media-section{flex:1;display:flex;flex-direction:column;min-width:0}
        .media-input-bar{padding:12px;background:var(--bg-secondary);border-bottom:1px solid var(--border-color);display:flex;flex-direction:column;gap:10px}
        .media-type-tabs{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}
        .media-type-tabs::-webkit-scrollbar{display:none}
        .type-tab{display:flex;align-items:center;gap:6px;padding:10px 14px;font-size:13px;font-weight:600;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:var(--radius-md);color:var(--text-secondary);cursor:pointer;white-space:nowrap;min-height:var(--touch-target)}
        .type-tab svg{width:16px;height:16px}
        .type-tab span{display:none}
        @media(min-width:480px){.type-tab span{display:inline}}
        .type-tab.active{background:rgba(168,85,247,0.15);border-color:var(--accent-primary);color:var(--accent-primary)}
        .url-input-wrapper{display:flex;gap:8px}
        .url-input-wrapper input{flex:1;padding:12px 14px;font-size:16px;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:var(--radius-md);color:var(--text-primary);outline:none;min-width:0}
        .url-input-wrapper input:focus{border-color:var(--accent-primary)}
        .url-input-wrapper input::placeholder{color:var(--text-muted);font-size:14px}
        .load-btn{width:var(--touch-target);height:var(--touch-target);background:var(--accent-gradient);border:none;border-radius:var(--radius-md);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}
        .load-btn svg{width:20px;height:20px}
        .player-container{flex:1;display:flex;align-items:center;justify-content:center;background:#000;position:relative;min-height:200px}
        .empty-player{display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--text-muted);text-align:center;padding:24px}
        .empty-icon{width:60px;height:60px;margin-bottom:16px;opacity:0.3}
        .empty-icon svg{width:100%;height:100%}
        .empty-player .hint{font-size:12px;margin-top:8px;opacity:0.7}
        .error-message{color:var(--accent-tertiary);text-align:center;padding:24px}
        .youtube-player-wrapper{width:100%;height:100%;display:flex;flex-direction:column}
        .youtube-container{flex:1;position:relative}
        .youtube-container iframe,.youtube-container>div{position:absolute;inset:0;width:100%!important;height:100%!important}
        .custom-controls{display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--bg-secondary);border-top:1px solid var(--border-color)}
        .time-display{font-family:monospace;font-size:12px;color:var(--text-secondary);min-width:45px}
        .progress-bar{flex:1;cursor:pointer;padding:8px 0}
        .progress-track{height:6px;background:var(--bg-tertiary);border-radius:3px;overflow:hidden}
        .progress-fill{height:100%;background:var(--accent-gradient);border-radius:3px;transition:width .1s}
        .sync-badge{font-size:11px;color:var(--accent-secondary);background:rgba(6,182,212,0.15);padding:4px 8px;border-radius:var(--radius-sm)}
        .spotify-player{width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:20px;background:linear-gradient(135deg,#1DB954 0%,#191414 100%)}
        .spotify-player iframe{border-radius:var(--radius-lg);max-width:100%}
        .url-player{width:100%;height:100%;position:relative}
        .url-player video{width:100%;height:100%;object-fit:contain}
        .sync-indicator{position:absolute;top:12px;right:12px;font-size:12px;background:rgba(6,182,212,0.9);color:#fff;padding:6px 12px;border-radius:var(--radius-md)}
        .sidebar-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:200}
        .room-sidebar{display:flex;flex-direction:column;background:var(--bg-secondary);border-left:1px solid var(--border-color);width:320px;position:fixed;right:0;top:0;bottom:0;z-index:300;transform:translateX(100%);transition:transform var(--transition-normal)}
        .room-sidebar.open{transform:translateX(0)}
        @media(min-width:1024px){.sidebar-overlay{display:none}.room-sidebar{position:static;transform:none}}
        .sidebar-close{position:absolute;top:12px;right:12px;width:var(--touch-target);height:var(--touch-target);background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:var(--radius-md);color:var(--text-primary);cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:10}
        @media(min-width:1024px){.sidebar-close{display:none}}
        .sidebar-close svg{width:20px;height:20px}
        .sidebar-section{display:flex;flex-direction:column;border-bottom:1px solid var(--border-color)}
        .sidebar-section:last-child{flex:1;border-bottom:none;min-height:0}
        .sidebar-section h3{display:flex;align-items:center;gap:8px;padding:14px 16px;font-size:13px;font-weight:700;color:var(--text-secondary);border-bottom:1px solid var(--border-color)}
        .sidebar-section h3 svg{width:16px;height:16px}
        .participants-list{padding:8px;max-height:150px;overflow-y:auto}
        .participant-item{display:flex;align-items:center;gap:10px;padding:10px;border-radius:var(--radius-md)}
        .p-avatar{font-size:18px}
        .p-name{flex:1;font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .p-host{font-size:14px}
        .chat-section{min-height:0}
        .chat-messages{flex:1;padding:12px;overflow-y:auto;display:flex;flex-direction:column;gap:10px}
        .chat-empty{color:var(--text-muted);font-size:13px;text-align:center;padding:32px}
        .message{display:flex;gap:8px}
        .message.system{justify-content:center}
        .system-text{font-size:11px;color:var(--text-muted);background:var(--bg-tertiary);padding:4px 10px;border-radius:var(--radius-sm)}
        .msg-avatar{font-size:16px}
        .msg-content{display:flex;flex-direction:column;gap:2px;min-width:0}
        .msg-author{font-size:12px;font-weight:600;color:var(--accent-primary)}
        .msg-text{font-size:13px;color:var(--text-primary);word-break:break-word}
        .chat-input{display:flex;gap:8px;padding:12px;border-top:1px solid var(--border-color)}
        .chat-input input{flex:1;padding:12px 14px;font-size:16px;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:var(--radius-md);color:var(--text-primary);outline:none;min-width:0}
        .chat-input input:focus{border-color:var(--accent-primary)}
        .chat-input input::placeholder{color:var(--text-muted);font-size:14px}
        .chat-input button{width:var(--touch-target);height:var(--touch-target);background:var(--accent-gradient);border:none;border-radius:var(--radius-md);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}
        .chat-input button svg{width:18px;height:18px}
        ::-webkit-scrollbar{width:6px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:var(--bg-tertiary);border-radius:3px}
      `}</style>
      {currentView === 'landing' && <LandingPage />}
      {currentView === 'lobby' && <LobbyPage />}
      {currentView === 'room' && <RoomPage />}
    </div>
  );
}
