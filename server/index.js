// ============================================================================
// SYNCSTREAM BACKEND - WebSocket Server
// ============================================================================
// Production-ready real-time synchronization server
// Technologies: Node.js, Socket.io, Redis, Express
// ============================================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Redis = require('ioredis');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
  port: process.env.PORT || 3001,
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined
  },
  cors: {
    origin: process.env.CORS_ORIGIN || ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true
  },
  room: {
    maxParticipants: 50,
    idleTimeout: 3600000, // 1 hour
    codeLength: 6
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100
  }
};

// ============================================================================
// INITIALIZE SERVER
// ============================================================================

const app = express();
const server = http.createServer(app);

// Redis clients
const redis = new Redis(config.redis);
const redisPub = new Redis(config.redis);
const redisSub = new Redis(config.redis);

// Socket.io with Redis adapter for scaling
const io = new Server(server, {
  cors: config.cors,
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(helmet());
app.use(cors(config.cors));
app.use(express.json());

const limiter = rateLimit(config.rateLimit);
app.use('/api/', limiter);

// ============================================================================
// DATA STRUCTURES
// ============================================================================

/**
 * Room Schema (Redis Hash)
 * room:{roomId}
 * - id: string
 * - name: string
 * - hostId: string
 * - createdAt: timestamp
 * - mediaType: 'youtube' | 'url' | 'spotify' | null
 * - mediaUrl: string | null
 * - isPlaying: boolean
 * - currentTime: number
 * - lastSync: timestamp
 */

/**
 * Room Participants (Redis Set)
 * room:{roomId}:participants
 * - userId strings
 */

/**
 * User Schema (Redis Hash)
 * user:{odaId}:{odaId}
 * - id: string
 * - name: string
 * - avatar: string
 * - socketId: string
 * - joinedAt: timestamp
 * - isHost: boolean
 */

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < config.room.codeLength; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function getRoomData(roomId) {
  const roomData = await redis.hgetall(`room:${roomId}`);
  if (!roomData || !roomData.id) return null;
  
  return {
    ...roomData,
    isPlaying: roomData.isPlaying === 'true',
    currentTime: parseFloat(roomData.currentTime) || 0,
    createdAt: parseInt(roomData.createdAt),
    lastSync: parseInt(roomData.lastSync)
  };
}

async function getRoomParticipants(roomId) {
  const participantIds = await redis.smembers(`room:${roomId}:participants`);
  const participants = [];
  
  for (const odaId of participantIds) {
    const userData = await redis.hgetall(`user:${roomId}:${odaId}`);
    if (userData && userData.id) {
      participants.push({
        ...userData,
        isHost: userData.isHost === 'true',
        joinedAt: parseInt(userData.joinedAt)
      });
    }
  }
  
  return participants.sort((a, b) => a.joinedAt - b.joinedAt);
}

async function deleteRoom(roomId) {
  const participantIds = await redis.smembers(`room:${roomId}:participants`);
  
  // Delete all user records
  for (const odaId of participantIds) {
    await redis.del(`user:${roomId}:${odaId}`);
  }
  
  // Delete room data
  await redis.del(`room:${roomId}`);
  await redis.del(`room:${roomId}:participants`);
  await redis.del(`room:${roomId}:messages`);
  
  console.log(`[Room] Deleted room: ${roomId}`);
}

// ============================================================================
// REST API ENDPOINTS
// ============================================================================

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Get room info
app.get('/api/room/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await getRoomData(roomId);
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    const participants = await getRoomParticipants(roomId);
    
    res.json({
      ...room,
      participantCount: participants.length
    });
  } catch (error) {
    console.error('[API] Error getting room:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create room
app.post('/api/room/create', async (req, res) => {
  try {
    const { userId, userName, userAvatar } = req.body;
    
    if (!userId || !userName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Generate unique room code
    let roomId;
    let attempts = 0;
    do {
      roomId = generateRoomCode();
      const exists = await redis.exists(`room:${roomId}`);
      if (!exists) break;
      attempts++;
    } while (attempts < 10);
    
    if (attempts >= 10) {
      return res.status(500).json({ error: 'Could not generate room code' });
    }
    
    const now = Date.now();
    
    // Create room
    await redis.hmset(`room:${roomId}`, {
      id: roomId,
      name: `${userName}'ın Odası`,
      hostId: odaId,
      createdAt: now,
      mediaType: '',
      mediaUrl: '',
      isPlaying: 'false',
      currentTime: '0',
      lastSync: now
    });
    
    // Set room TTL (auto-delete after idle)
    await redis.expire(`room:${roomId}`, config.room.idleTimeout / 1000);
    
    res.json({
      roomId,
      name: `${userName}'ın Odası`,
      createdAt: now
    });
  } catch (error) {
    console.error('[API] Error creating room:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Validate room exists
app.get('/api/room/:roomId/validate', async (req, res) => {
  try {
    const { roomId } = req.params;
    const exists = await redis.exists(`room:${roomId}`);
    
    if (!exists) {
      return res.status(404).json({ valid: false });
    }
    
    const participants = await redis.scard(`room:${roomId}:participants`);
    
    res.json({
      valid: true,
      participantCount: participants,
      isFull: participants >= config.room.maxParticipants
    });
  } catch (error) {
    console.error('[API] Error validating room:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// SOCKET.IO EVENT HANDLERS
// ============================================================================

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);
  
  let currentRoom = null;
  let currentUser = null;
  
  // ========== JOIN ROOM ==========
  socket.on('join_room', async (data) => {
    try {
      const { roomId, user } = data;
      
      if (!roomId || !user || !user.id || !user.name) {
        socket.emit('error', { message: 'Invalid join request' });
        return;
      }
      
      // Check if room exists
      const room = await getRoomData(roomId);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }
      
      // Check room capacity
      const participantCount = await redis.scard(`room:${roomId}:participants`);
      if (participantCount >= config.room.maxParticipants) {
        socket.emit('error', { message: 'Room is full' });
        return;
      }
      
      // Store user data
      currentRoom = roomId;
      currentUser = {
        ...user,
        socketId: socket.id,
        joinedAt: Date.now(),
        isHost: room.hostId === user.id
      };
      
      await redis.hmset(`user:${roomId}:${user.id}`, {
        id: user.id,
        name: user.name,
        avatar: user.avatar || '🎬',
        socketId: socket.id,
        joinedAt: currentUser.joinedAt,
        isHost: currentUser.isHost ? 'true' : 'false'
      });
      
      await redis.sadd(`room:${roomId}:participants`, user.id);
      
      // Join socket room
      socket.join(roomId);
      
      // Get current participants
      const participants = await getRoomParticipants(roomId);
      
      // Get chat history (last 50 messages)
      const messages = await redis.lrange(`room:${roomId}:messages`, -50, -1);
      const parsedMessages = messages.map(m => JSON.parse(m));
      
      // Send room state to joining user
      socket.emit('room_joined', {
        room,
        participants,
        messages: parsedMessages,
        isHost: currentUser.isHost
      });
      
      // Notify other participants
      socket.to(roomId).emit('participant_joined', {
        user: currentUser
      });
      
      // Reset room TTL
      await redis.expire(`room:${roomId}`, config.room.idleTimeout / 1000);
      
      console.log(`[Socket] User ${user.name} joined room ${roomId}`);
    } catch (error) {
      console.error('[Socket] Error joining room:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });
  
  // ========== MEDIA CHANGE ==========
  socket.on('media_change', async (data) => {
    try {
      if (!currentRoom || !currentUser) return;
      
      const { mediaType, mediaUrl } = data;
      
      // Update room state
      await redis.hmset(`room:${currentRoom}`, {
        mediaType: mediaType || '',
        mediaUrl: mediaUrl || '',
        isPlaying: 'false',
        currentTime: '0',
        lastSync: Date.now()
      });
      
      // Broadcast to all room participants
      io.to(currentRoom).emit('media_changed', {
        mediaType,
        mediaUrl,
        changedBy: currentUser.name,
        timestamp: Date.now()
      });
      
      // Add system message
      const systemMessage = {
        id: uuidv4(),
        type: 'system',
        text: `${currentUser.name} yeni medya yükledi`,
        timestamp: Date.now()
      };
      
      await redis.rpush(`room:${currentRoom}:messages`, JSON.stringify(systemMessage));
      io.to(currentRoom).emit('chat_message', systemMessage);
      
      console.log(`[Socket] Media changed in room ${currentRoom}: ${mediaType}`);
    } catch (error) {
      console.error('[Socket] Error changing media:', error);
    }
  });
  
  // ========== PLAYBACK STATE ==========
  socket.on('playback_state', async (data) => {
    try {
      if (!currentRoom || !currentUser) return;
      
      const { isPlaying, currentTime } = data;
      const now = Date.now();
      
      // Update room state
      await redis.hmset(`room:${currentRoom}`, {
        isPlaying: isPlaying ? 'true' : 'false',
        currentTime: currentTime.toString(),
        lastSync: now
      });
      
      // Broadcast to all room participants (including sender for confirmation)
      io.to(currentRoom).emit('playback_sync', {
        isPlaying,
        currentTime,
        syncedBy: currentUser.name,
        timestamp: now
      });
      
      console.log(`[Socket] Playback ${isPlaying ? 'playing' : 'paused'} at ${currentTime}s in room ${currentRoom}`);
    } catch (error) {
      console.error('[Socket] Error updating playback:', error);
    }
  });

  // ========== NEW SYNC EVENTS (Frontend Compatible) ==========
  socket.on('sync:play', async (data) => {
    try {
      if (!currentRoom || !currentUser) return;
      const { time } = data;
      await redis.hmset(`room:${currentRoom}`, { isPlaying: 'true', currentTime: time.toString(), lastSync: Date.now() });
      socket.to(currentRoom).emit('sync:play', { time });
      console.log(`[Sync] Play at ${time}s in room ${currentRoom}`);
    } catch (error) {
      console.error('[Sync] Error:', error);
    }
  });

  socket.on('sync:pause', async (data) => {
    try {
      if (!currentRoom || !currentUser) return;
      const { time } = data;
      await redis.hmset(`room:${currentRoom}`, { isPlaying: 'false', currentTime: time.toString(), lastSync: Date.now() });
      socket.to(currentRoom).emit('sync:pause', { time });
      console.log(`[Sync] Pause at ${time}s in room ${currentRoom}`);
    } catch (error) {
      console.error('[Sync] Error:', error);
    }
  });

  socket.on('sync:seek', async (data) => {
    try {
      if (!currentRoom || !currentUser) return;
      const { time } = data;
      await redis.hmset(`room:${currentRoom}`, { currentTime: time.toString(), lastSync: Date.now() });
      socket.to(currentRoom).emit('sync:seek', { time });
      console.log(`[Sync] Seek to ${time}s in room ${currentRoom}`);
    } catch (error) {
      console.error('[Sync] Error:', error);
    }
  });

  socket.on('sync:request', async () => {
    try {
      if (!currentRoom) return;
      const room = await getRoomData(currentRoom);
      if (room) {
        socket.emit('sync:state', {
          time: room.currentTime,
          playing: room.isPlaying,
          mediaType: room.mediaType,
          mediaUrl: room.mediaUrl
        });
      }
    } catch (error) {
      console.error('[Sync] Error:', error);
    }
  });

  socket.on('sync:state', async (data) => {
    try {
      if (!currentRoom) return;
      // Host broadcasts state to all (or specific user)
      if (data.targetUserId) {
        // Find target socket and emit
        const participants = await getRoomParticipants(currentRoom);
        const target = participants.find(p => p.id === data.targetUserId);
        if (target && target.socketId) {
          io.to(target.socketId).emit('sync:state', data);
        }
      } else {
        socket.to(currentRoom).emit('sync:state', data);
      }
    } catch (error) {
      console.error('[Sync] Error:', error);
    }
  });

  // ========== ROOM JOIN/LEAVE EVENTS (Frontend Compatible) ==========
  socket.on('room:join', async (data) => {
    try {
      const { roomId, user } = data;
      currentRoom = roomId;
      currentUser = user;

      // Join socket room
      socket.join(roomId);

      // Check if room exists, create if not
      const roomExists = await redis.exists(`room:${roomId}`);
      if (!roomExists) {
        await redis.hmset(`room:${roomId}`, {
          id: roomId,
          name: user.isHost ? `${user.name}'ın Odası` : 'Watch Party',
          hostId: user.isHost ? user.id : '',
          createdAt: Date.now(),
          mediaType: '',
          mediaUrl: '',
          isPlaying: 'false',
          currentTime: '0',
          lastSync: Date.now()
        });
      }

      // Add user to room
      await redis.sadd(`room:${roomId}:participants`, user.id);
      await redis.hmset(`user:${roomId}:${user.id}`, {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        socketId: socket.id,
        joinedAt: Date.now(),
        isHost: user.isHost ? 'true' : 'false'
      });

      // Get all participants
      const participants = await getRoomParticipants(roomId);
      
      // Send current state to joiner
      const room = await getRoomData(roomId);
      socket.emit('room:users', participants);
      if (room && room.mediaUrl) {
        socket.emit('media:change', { mediaType: room.mediaType, mediaUrl: room.mediaUrl });
      }

      // Notify others
      socket.to(roomId).emit('room:user_joined', user);
      
      console.log(`[Room] ${user.name} joined room ${roomId}`);
    } catch (error) {
      console.error('[Room] Join error:', error);
    }
  });

  socket.on('room:leave', async (data) => {
    await handleLeaveRoom();
  });

  socket.on('chat:message', async (data) => {
    try {
      if (!currentRoom) return;
      const { roomId, message } = data;
      
      // Broadcast to all in room
      socket.to(roomId).emit('chat:message', message);
      
      // Store in Redis
      await redis.rpush(`room:${roomId}:messages`, JSON.stringify(message));
      await redis.ltrim(`room:${roomId}:messages`, -100, -1);
      
      console.log(`[Chat] Message in ${roomId}`);
    } catch (error) {
      console.error('[Chat] Error:', error);
    }
  });

  socket.on('media:change', async (data) => {
    try {
      if (!currentRoom) return;
      const { roomId, mediaType, mediaUrl } = data;
      
      // Update room state
      await redis.hmset(`room:${roomId}`, { mediaType, mediaUrl, currentTime: '0', isPlaying: 'false' });
      
      // Broadcast to others
      socket.to(roomId).emit('media:change', { mediaType, mediaUrl });
      
      console.log(`[Media] Changed in ${roomId}: ${mediaType}`);
    } catch (error) {
      console.error('[Media] Error:', error);
    }
  });
  
  // ========== SEEK ==========
  socket.on('seek', async (data) => {
    try {
      if (!currentRoom || !currentUser) return;
      
      const { currentTime } = data;
      const now = Date.now();
      
      // Update room state
      await redis.hmset(`room:${currentRoom}`, {
        currentTime: currentTime.toString(),
        lastSync: now
      });
      
      // Broadcast seek to all participants
      io.to(currentRoom).emit('seek_sync', {
        currentTime,
        seekedBy: currentUser.name,
        timestamp: now
      });
      
      console.log(`[Socket] Seeked to ${currentTime}s in room ${currentRoom}`);
    } catch (error) {
      console.error('[Socket] Error seeking:', error);
    }
  });
  
  // ========== REQUEST SYNC ==========
  socket.on('request_sync', async () => {
    try {
      if (!currentRoom) return;
      
      const room = await getRoomData(currentRoom);
      if (room) {
        socket.emit('sync_response', {
          isPlaying: room.isPlaying,
          currentTime: room.currentTime,
          mediaType: room.mediaType,
          mediaUrl: room.mediaUrl,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('[Socket] Error requesting sync:', error);
    }
  });
  
  // ========== CHAT MESSAGE ==========
  socket.on('chat_message', async (data) => {
    try {
      if (!currentRoom || !currentUser) return;
      
      const { text } = data;
      
      if (!text || text.trim().length === 0) return;
      if (text.length > 500) return; // Max message length
      
      const message = {
        id: uuidv4(),
        type: 'user',
        userId: currentUser.id,
        userName: currentUser.name,
        userAvatar: currentUser.avatar,
        text: text.trim(),
        timestamp: Date.now()
      };
      
      // Store message
      await redis.rpush(`room:${currentRoom}:messages`, JSON.stringify(message));
      
      // Keep only last 100 messages
      await redis.ltrim(`room:${currentRoom}:messages`, -100, -1);
      
      // Broadcast to all room participants
      io.to(currentRoom).emit('chat_message', message);
      
      console.log(`[Socket] Chat message in room ${currentRoom}: ${currentUser.name}`);
    } catch (error) {
      console.error('[Socket] Error sending chat message:', error);
    }
  });
  
  // ========== TYPING INDICATOR ==========
  socket.on('typing_start', () => {
    if (!currentRoom || !currentUser) return;
    socket.to(currentRoom).emit('user_typing', { user: currentUser });
  });
  
  socket.on('typing_stop', () => {
    if (!currentRoom || !currentUser) return;
    socket.to(currentRoom).emit('user_stopped_typing', { userId: currentUser.id });
  });
  
  // ========== LEAVE ROOM ==========
  socket.on('leave_room', async () => {
    await handleLeaveRoom();
  });
  
  // ========== DISCONNECT ==========
  socket.on('disconnect', async () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);
    await handleLeaveRoom();
  });
  
  // ========== HANDLE LEAVE ==========
  async function handleLeaveRoom() {
    try {
      if (!currentRoom || !currentUser) return;
      
      // Remove user from room
      await redis.srem(`room:${currentRoom}:participants`, currentUser.id);
      await redis.del(`user:${currentRoom}:${currentUser.id}`);
      
      // Leave socket room
      socket.leave(currentRoom);
      
      // Check if room is empty
      const remainingCount = await redis.scard(`room:${currentRoom}:participants`);
      
      if (remainingCount === 0) {
        // Delete room if empty
        await deleteRoom(currentRoom);
      } else {
        // Notify remaining participants
        socket.to(currentRoom).emit('participant_left', {
          userId: currentUser.id,
          userName: currentUser.name
        });
        
        // If host left, assign new host
        const room = await getRoomData(currentRoom);
        if (room && room.hostId === currentUser.id) {
          const participants = await getRoomParticipants(currentRoom);
          if (participants.length > 0) {
            const newHost = participants[0];
            await redis.hset(`room:${currentRoom}`, 'hostId', newHost.id);
            await redis.hset(`user:${currentRoom}:${newHost.id}`, 'isHost', 'true');
            
            io.to(currentRoom).emit('host_changed', {
              newHostId: newHost.id,
              newHostName: newHost.name
            });
          }
        }
        
        // Add system message
        const systemMessage = {
          id: uuidv4(),
          type: 'system',
          text: `${currentUser.name} odadan ayrıldı`,
          timestamp: Date.now()
        };
        
        await redis.rpush(`room:${currentRoom}:messages`, JSON.stringify(systemMessage));
        io.to(currentRoom).emit('chat_message', systemMessage);
      }
      
      console.log(`[Socket] User ${currentUser.name} left room ${currentRoom}`);
      
      currentRoom = null;
      currentUser = null;
    } catch (error) {
      console.error('[Socket] Error leaving room:', error);
    }
  }
});

// ============================================================================
// CLEANUP TASKS
// ============================================================================

// Periodic cleanup of stale rooms
setInterval(async () => {
  try {
    const keys = await redis.keys('room:*');
    const roomIds = new Set();
    
    keys.forEach(key => {
      const match = key.match(/^room:([A-Z0-9]{6})$/);
      if (match) roomIds.add(match[1]);
    });
    
    for (const roomId of roomIds) {
      const participantCount = await redis.scard(`room:${roomId}:participants`);
      const room = await getRoomData(roomId);
      
      if (room && participantCount === 0) {
        const age = Date.now() - room.createdAt;
        if (age > config.room.idleTimeout) {
          await deleteRoom(roomId);
        }
      }
    }
  } catch (error) {
    console.error('[Cleanup] Error:', error);
  }
}, 300000); // Run every 5 minutes

// ============================================================================
// START SERVER
// ============================================================================

server.listen(config.port, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    SYNCSTREAM SERVER                          ║
║═══════════════════════════════════════════════════════════════║
║  Status:     RUNNING                                          ║
║  Port:       ${config.port}                                            ║
║  Redis:      ${config.redis.host}:${config.redis.port}                               ║
║  Time:       ${new Date().toISOString()}                 ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Server] Shutting down...');
  
  io.close();
  await redis.quit();
  await redisPub.quit();
  await redisSub.quit();
  
  server.close(() => {
    console.log('[Server] Shutdown complete');
    process.exit(0);
  });
});

module.exports = { app, io, redis };
